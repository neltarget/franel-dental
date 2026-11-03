#!/usr/bin/env python3
"""Franel platform gateway -- WhatsApp Cloud API channel + the platform's only
Meta-token holder. stdlib only (mirrors sync/franel_sync.py style).

In  (webhook, Meta -> us, POST /whatsapp):
  verify X-Hub-Signature-256, 200-ack immediately, then process async:
    messages events          -> upsert patients/conversations -> insert messages row
    statuses events          -> backfill messages.metadata.wa_status by wa_message_id
    template_status_update   -> backfill clinics.wa_templates_status

Out (loopback/VPC only, agent + ops worker call us):
  POST /send          {clinic_id, to, text}   free-form, 24 h window enforced
  POST /send-template {clinic_id, to, template_name, language, components}
  POST /onboard       {clinic_id, phone}      link -> display name -> 5 templates
  GET  /health        last-webhook age, clinic cache, outbox depth, token probe

Messages >1024 chars are split sequentially (Meta free-form cap). If a Graph
call fails, the unsent tail goes to the local outbox.json (bounded, mode 600)
and the caller gets 202 queued; the outbox thread retries until it lands or the
clinic is suspended. Every outbound lands in messages (sender='franel') after
the Graph call succeeds, so the dashboard realtime feed is complete.

Note: the legacy franel_sync era used 'send-<wamid>' for outbound rows; this
gateway writes 'msg-<wamid>' for everything (hermes-runner-contract.md section 4).

  systemd: franel-gateway.service
  dry run: python3 gateway.py --dry-run        (no Meta/Supabase writes; fake wamids)
  replay:  python3 scripts/wa_replay.py <event.json> [--dry-run]
"""

import argparse
import hashlib
import hmac
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timedelta, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.expanduser("~/.config/franel-gateway.env")
LOG_FILE = os.path.join(BASE, "gateway.log")
OUTBOX_FILE = os.path.join(BASE, "outbox.json")
MAX_LOG_LINES = 5000
MAX_OUTBOX = 500
MAX_OUTBOX_ATTEMPTS = 72            # ~12 h at the default 10 s cadence
TEXT_CHUNK = 1024                   # Meta free-form body cap
WINDOW_HOURS = 24
CLINIC_CACHE_TTL = 60
OUTBOX_CYCLE_S = 10
TOKEN_PROBE_TTL = 300

# Default utility-template wording, used only when a clinic's
# clinic_config.whatsapp_templates does not define its own text for that name.
# {{1}}..{{n}} are WhatsApp template parameter slots.
TEMPLATE_JOB_DEFAULTS = [
    ("franel_reminder",
     "Hi {{1}}, this is a reminder about your upcoming appointment. Please reply to confirm."),
    ("franel_booking_confirm",
     "Hi {{1}}, your appointment is confirmed. We look forward to seeing you."),
    ("franel_checkin",
     "Hi {{1}}, just checking in - how are you feeling after your visit?"),
    ("franel_no_show_recovery",
     "Hi {{1}}, we missed you at your appointment. Would you like to rebook?"),
    ("franel_lead_followup",
     "Hi {{1}}, following up on your enquiry. Do you have a preferred time this week?"),
]


def now():
    return datetime.now(timezone.utc)


def now_iso():
    return now().isoformat()


def log(level, msg):
    line = f"{now().isoformat()} [{level}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8", errors="replace") as f:
            f.write(line + "\n")
        with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            n = sum(1 for _ in f)
        if n > MAX_LOG_LINES:
            with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                tail = [l for l in f][n - MAX_LOG_LINES:]
            with open(LOG_FILE, "w", encoding="utf-8", errors="replace") as f:
                f.write("".join(tail))
    except OSError:
        pass


def load_env(path=ENV_FILE):
    env = {}
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                for ln in f:
                    ln = ln.strip()
                    if not ln or ln.startswith("#") or "=" not in ln:
                        continue
                    k, v = ln.split("=", 1)
                    env[k.strip()] = v.strip()
        except OSError:
            pass
    return env


def split_text(text, limit=TEXT_CHUNK):
    """Split on spaces, never mid-word; each piece <= limit."""
    out, cur = [], ""
    for word in (text or "").split(" "):
        if cur and len(cur) + 1 + len(word) > limit:
            out.append(cur)
            cur = word
        else:
            cur = (cur + " " + word) if cur else word
    if cur:
        out.append(cur)
    return out


def e164(s):
    d = re.sub(r"\D", "", s or "")
    return ("+" + d) if d else None


def wa_msg_id(wamid):
    return f"msg-{wamid}"


class SB:
    """Minimal PostgREST client (service_role bypasses RLS). Copied from
    sync/franel_sync.py so the gateway deploys as one self-contained file."""

    _NON_FILTER = frozenset({"select", "order", "limit", "offset", "on_conflict"})
    _OP_RE = re.compile(
        r"^(not[.(]|\(|(?:eq|neq|gt|gte|lt|lte|in|is|cs|like|ilike|sl|sr|overlaps|"
        r"match|fts|plfts|phfts|imatches)\.)"
    )

    def __init__(self, url, key):
        self.url = url.rstrip("/")
        self.key = key

    def _norm(self, params):
        # PostgREST here rejects implicit "col=value" filters (PGRST100);
        # every plain filter value must carry an explicit operator.
        out = {}
        for k, v in params.items():
            if k in self._NON_FILTER or v is None or v == "":
                out[k] = v
            elif v.startswith("(") or self._OP_RE.match(str(v)):
                out[k] = v
            else:
                out[k] = "eq." + str(v)
        return out

    def _req(self, method, path, body=None, params=None, prefer=None):
        url = self.url + "/rest/v1/" + path
        if params:
            url += "?" + urllib.parse.urlencode(self._norm(params))
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("apikey", self.key)
        req.add_header("Authorization", "Bearer " + self.key)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if prefer:
            req.add_header("Prefer", prefer)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                if not raw:
                    return True, None, None
                try:
                    return True, json.loads(raw), None
                except ValueError:
                    return True, raw.decode(errors="replace"), None
        except urllib.error.HTTPError as e:
            return False, None, f"HTTP {e.code}: {e.read().decode(errors='replace')[:300]}"
        except Exception as e:
            return False, None, str(e)[:300]

    def get(self, path, **params):
        return self._req("GET", path, params=params)

    def insert(self, table, row):
        return self._req("POST", table, body=row, prefer="return=representation")

    def update(self, table, row, where_params):
        return self._req(
            "PATCH", table, body=row, params=where_params,
            prefer="return=representation",
        )

class Graph:
    """WhatsApp Cloud API client. In dry-run mode, logs the intended call and
    returns a structurally-valid fake result (wamids / entries) instead."""

    def __init__(self, token, version, dry=False):
        self.token = token
        self.version = version
        self.dry = dry
        self._dry_n = 0

    def _dummy_wamid(self):
        self._dry_n += 1
        return f"wamid.dryrun.{int(time.time() * 1000)}.{self._dry_n}"

    def _req(self, method, path, body=None, params=None):
        url = f"https://graph.facebook.com/{self.version}/{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", "Bearer " + self.token)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return True, (json.loads(raw) if raw else {}), None
        except urllib.error.HTTPError as e:
            return False, None, f"HTTP {e.code}: {e.read().decode(errors='replace')[:300]}"
        except Exception as e:
            return False, None, str(e)[:300]

    def _get(self, path, params=None):
        return self._req("GET", path, params=params)

    def send_text(self, phone_number_id, to, text):
        if self.dry:
            log("DRY", f"send_text {phone_number_id} -> {to}: {text[:120]!r}")
            return True, {"messages": [{"id": self._dummy_wamid()}]}, None
        return self._req("POST", f"{phone_number_id}/messages", {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        })

    def send_template(self, phone_number_id, to, template_name, language, components):
        if self.dry:
            log("DRY", f"send_template {phone_number_id} -> {to} {template_name} {components!r}")
            return True, {"messages": [{"id": self._dummy_wamid()}]}, None
        body = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {"name": template_name, "language": {"code": language}},
        }
        if components:
            body["template"]["components"] = components
        return self._req("POST", f"{phone_number_id}/messages", body)

    def link_number(self, business_id, phone, display_name=None, verified=False):
        if self.dry:
            log("DRY", f"link_number {business_id} {phone} name={display_name!r}")
            return True, {"id": f"phonenumber.dryrun.{self._dry_n + 1}"}, None
        body = {"phone_number": phone}
        if display_name:
            body["display_name"] = display_name
        if verified:
            body["verified"] = True
        return self._req("POST", f"{business_id}/phone_numbers", body)

    def set_display_name(self, phone_number_id, name):
        if self.dry:
            log("DRY", f"set_display_name {phone_number_id} {name!r}")
            return True, {}, None
        return self._req("POST", f"{phone_number_id}/profile", {"display_name": name})

    def create_template(self, business_id, name, language, body_text):
        if self.dry:
            log("DRY", f"create_template {business_id} {name} {body_text[:120]!r}")
            return True, {}, None
        return self._req("POST", f"{business_id}/message_templates", {
            "name": name,
            "language": language,
            "category": "UTILITY",
            "components": [{"type": "BODY", "text": body_text}],
        })

    def template_status(self, business_id, name):
        if self.dry:
            return True, {"data": [{"name": name, "status": "APPROVED",
                                     "category": "UTILITY"}]}, None
        return self._get(f"{business_id}/message_templates",
                         {"name": name, "fields": "name,status,category"})

    def token_probe(self):
        ok, data, err = self._get("me")
        if ok and not self.dry:
            return True, (data or {}).get("id"), None
        if self.dry:
            return True, "dryrun-business", None
        return False, None, err


class Gateway:
    def __init__(self, env, dry=False):
        self.env = env
        self.dry = dry
        self.sb = SB(env.get("SUPABASE_URL", ""), env.get("SUPABASE_SERVICE_KEY", ""))
        self.graph = Graph(env.get("WA_APP_TOKEN", ""),
                           env.get("WA_GRAPH_VERSION", "v23.0"), dry)
        self.app_secret = env.get("WA_APP_SECRET", "")
        self.verify_token = env.get("WA_VERIFY_TOKEN", "")
        self.gateway_secret = env.get("GATEWAY_SECRET", "")
        self.business_id = env.get("WA_BUSINESS_ID", "")
        self.clinics = {}          # phone_number_id -> clinic row
        self.clinics_by_id = {}    # clinic_id -> clinic row
        self.cache_ts = 0.0
        self.last_webhook_at = 0.0
        self.outbox_lock = threading.Lock()
        self.state_lock = threading.Lock()
        self._token_probe = (0.0, None)
        self.booted_at = now().isoformat()

    # ---- clinic routing cache --------------------------------------------------

    def refresh_clinics(self, force=False):
        if not force and time.time() - self.cache_ts < CLINIC_CACHE_TTL:
            return
        if self.dry:
            row = {"id": "dry-clinic", "name": "Dry-run clinic",
                   "wa_number": "+233500000000", "wa_status": "active",
                   "status": "active", "wa_display_name": None,
                   "wa_phone_number_id": "dry-phone-id"}
            with self.state_lock:
                self.clinics.setdefault(row["wa_phone_number_id"], row)
                self.clinics_by_id.setdefault(row["id"], row)
                self.cache_ts = time.time()
            return
        ok, rows, err = self.sb.get(
            "clinics",
            select="id,name,wa_number,wa_phone_number_id,wa_status,status,wa_display_name,"
                   "wa_templates_status",
            **{"wa_phone_number_id": "not.null"},
        )
        if not ok or not isinstance(rows, list):
            log("WARN", f"clinic cache refresh failed: {err or rows}")
            return
        clinics, by_id = {}, {}
        for r in rows:
            if r.get("wa_phone_number_id"):
                clinics[r["wa_phone_number_id"]] = r
            by_id[r["id"]] = r
        with self.state_lock:
            self.clinics, self.clinics_by_id, self.cache_ts = clinics, by_id, time.time()
        log("INFO", f"clinic cache refreshed: {len(clinics)} linked number(s), "
                    f"{len(by_id)} clinic(s) total")

    def clinic_by_phone_id(self, phone_number_id):
        self.refresh_clinics()
        row = self.clinics.get(phone_number_id)
        if row is None and self.dry:
            log("DRY", f"unknown phone_number_id={phone_number_id} -> dry-run clinic "
                        f"(offline testing)")
            row = self.clinics.get("dry-phone-id")
        return row

    def clinic_by_id(self, clinic_id):
        self.refresh_clinics()
        return self.clinics_by_id.get(clinic_id)

    def upsert_clinic(self, clinic_id, patch):
        if self.dry:
            log("DRY", f"update clinics {clinic_id} {patch!r}")
            return True
        return self.sb.update("clinics", patch, {"id": clinic_id})[0]

    # ---- patient / conversation upserts (Cloud API: key by E.164 phone) --------

    def upsert_patient(self, clinic, phone):
        phone = e164(phone)
        if not phone:
            return None
        if self.dry:
            return "dry-patient"
        ok, rows, err = self.sb.get(
            "patients", select="id", clinic_id=clinic["id"], **{"phone": phone}, limit="1"
        )
        if not ok or not isinstance(rows, list):
            log("WARN", f"patient lookup failed ({phone}): {err or rows}")
            return None
        if rows:
            return rows[0]["id"]
        row = {
            "clinic_id": clinic["id"],
            "name": "WhatsApp patient",
            "phone": phone,
            "email": None,
            "source": "whatsapp",
            "notes": None,
            "wa_chat_id": phone,   # Cloud API has no JID; the number is the chat id
        }
        ok, data, err = self.sb.insert("patients", row)
        if ok and isinstance(data, list) and data and data[0].get("id"):
            pid = data[0]["id"]
            log("INFO", f"patient created {phone} -> {pid} (clinic {clinic['id']})")
            return pid
        log("WARN", f"patient create failed ({phone}): {err or data}")
        return None

    def upsert_conversation(self, clinic, patient_id):
        if self.dry:
            return "dry-conv"
        ok, rows, err = self.sb.get(
            "conversations", select="id", clinic_id=clinic["id"],
            **{"patient_id": patient_id}, limit="1", order="created_at.asc",
        )
        if not ok or not isinstance(rows, list):
            log("WARN", f"conversation lookup failed ({patient_id}): {err or rows}")
            return None
        if rows:
            return rows[0]["id"]
        row = {
            "clinic_id": clinic["id"],
            "patient_id": patient_id,
            "status": "new",
            "intent": None,
            "service_interest": None,
            "lead_level": None,
            "last_message_at": None,
            "last_message_preview": None,
            "assigned_staff_id": None,
        }
        ok, data, err = self.sb.insert("conversations", row)
        if ok and isinstance(data, list) and data and data[0].get("id"):
            log("INFO", f"conversation created for {patient_id} -> {data[0]['id']}")
            return data[0]["id"]
        log("WARN", f"conversation create failed ({patient_id}): {err or data}")
        return None

    # ---- inbound webhook ---------------------------------------------------------

    def process_webhook(self, payload):
        try:
            self._process_webhook(payload)
        except Exception as e:
            log("ERROR", f"webhook processing crashed: {e!r}")

    def _process_webhook(self, payload):
        self.last_webhook_at = time.time()
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                phone_id = value.get("phone_number_id")
                clinic = self.clinic_by_phone_id(phone_id)
                if clinic is None:
                    log("WARN", f"unknown phone_number_id={phone_id} "
                                f"(no clinic bound) - event dropped")
                    continue
                if clinic.get("status") == "suspended":
                    log("WARN", f"clinic {clinic['id']} suspended - event dropped")
                    continue
                for ref in value.get("statuses", []):
                    self.handle_status(clinic, ref)
                for t in value.get("template_status_update", []):
                    self.handle_template_status(clinic, t)
                for msg in value.get("messages", []):
                    self.handle_inbound_message(clinic, msg)

    def handle_inbound_message(self, clinic, msg):
        mtype = msg.get("type", "text")
        phone = msg.get("from") or ""
        wamid = msg.get("id") or ""
        content, message_type, metadata = None, mtype, {}
        if mtype == "text":
            content = (msg.get("text") or {}).get("body", "")
        elif mtype == "audio":
            # STT pipe not wired in this build (Hermes-side follow-up): store the
            # media id so the transcript can be back-filled out of band.
            media_id = (msg.get("audio") or {}).get("id") or ""
            content = "[voice message]"
            message_type = "voice"
            metadata = {"media_kind": "audio", "wa_media_id": media_id, "stt": "pending"}
        elif mtype == "image":
            media_id = (msg.get("image") or {}).get("id") or ""
            content = "[image message]"
            message_type = "image"
            metadata = {"media_kind": "image", "wa_media_id": media_id}
        else:
            # sticker/video/document/location/... : acknowledge-only row (POC parity)
            content = f"[{mtype} message]"
            message_type = "system"
            metadata = {"wa_type": mtype}
        patient_id = self.upsert_patient(clinic, phone)
        if not patient_id:
            return
        conv_id = self.upsert_conversation(clinic, patient_id)
        if not conv_id:
            return
        if self.dry:
            log("DRY", f"inbound {mtype} from {phone} (clinic {clinic['id']}): {content!r}")
            return
        row = {
            "conversation_id": conv_id,
            "sender": "patient",
            "content": content,
            "message_type": message_type,
            "metadata": metadata,
            "wa_message_id": wa_msg_id(wamid) if wamid else None,
        }
        ok, data, err = self.sb.insert("messages", row)
        if not ok:
            log("ERROR", f"inbound insert failed ({wamid}): {err or data}")
            return
        ms = msg.get("timestamp")
        if ms:
            try:
                ts = int(ms)
                if ts > 10**12:  # Meta normally sends seconds; tolerate ms
                    ts /= 1000
                at = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
                self.sb.update("conversations",
                               {"last_message_at": at,
                                "last_message_preview": (content or "")[:200]},
                               {"id": conv_id})
            except (ValueError, OSError):
                pass
        self.usage(clinic["id"], "incoming_message", ref_type="message", ref_id=wamid)
        log("INFO", f"inbound {message_type} from {phone} -> conv {conv_id} "
                    f"(clinic {clinic['id']})")

    def handle_status(self, clinic, ref):
        wamid = ref.get("id") or ""
        status = ref.get("status") or ""
        if not wamid or status not in ("sent", "delivered", "read", "failed"):
            return
        if self.dry:
            log("DRY", f"status {status} for {wamid}")
            return
        ok, rows, err = self.sb.get(
            "messages", select="id,metadata", **{"wa_message_id": wa_msg_id(wamid)}, limit="1"
        )
        if not ok or not isinstance(rows, list) or not rows:
            log("WARN", f"status backfill: no message row for {wamid}: {err or rows}")
            return
        meta = dict(rows[0].get("metadata") or {})
        meta["wa_status"] = status
        meta["wa_status_at"] = now_iso()
        if status == "failed":
            meta["wa_failure_error"] = json.dumps(
                ref.get("errors") or ref.get("pricing") or {}
            )[:300]
        self.sb.update("messages", {"id": rows[0]["id"], "metadata": meta},
                       {"id": rows[0]["id"]})
        log("INFO", f"wa_status={status} for {wamid} (clinic {clinic['id']})")

    def handle_template_status(self, clinic, t):
        name = t.get("name") or ""
        status = t.get("status") or ""
        lang = (t.get("language") or {}).get("code", "") if isinstance(t.get("language"), dict) \
            else (t.get("language") or "")
        if not name:
            return
        if self.dry:
            log("DRY", f"template_status_update {name} {status} {lang!r}")
            return
        maps = dict(clinic.get("wa_templates_status") or {})
        maps[name] = {"status": status, "language": lang, "at": now_iso()}
        self.upsert_clinic(clinic["id"], {"wa_templates_status": maps})
        log("INFO", f"template {name} -> {status} (clinic {clinic['id']})")
        self._maybe_activate(clinic["id"], maps)

    def _maybe_activate(self, clinic_id, maps):
        """All tracked templates approved -> wa_status active."""
        tracked = set(TEMPLATE_JOB_DEFAULTS and [n for n, _ in TEMPLATE_JOB_DEFAULTS])
        states = {k: (v.get("status") if isinstance(v, dict) else v)
                  for k, v in (maps or {}).items() if k in tracked}
        if tracked and all(s == "APPROVED" for s in states.values()) \
                and len(states) == len(tracked):
            ok, rows, _ = self.sb.get(
                "clinics", select="wa_status,status", **{"id": clinic_id}, limit="1"
            )
            if ok and rows and rows[0].get("wa_status") == "templates_pending":
                self.upsert_clinic(clinic_id, {"wa_status": "active"})
                log("INFO", f"clinic {clinic_id} wa_status -> active (all templates approved)")

    # ---- metering ----------------------------------------------------------------

    def usage(self, clinic_id, event_type, ref_type=None, ref_id=None, amount=1):
        if self.dry:
            log("DRY", f"usage_events clinic={clinic_id} {event_type} {ref_type}={ref_id}")
            return
        self.sb.insert("usage_events", {
            "clinic_id": clinic_id,
            "event_type": event_type,
            "amount": amount,
            "ref_type": ref_type,
            "ref_id": ref_id,
        })

    # ---- outbound API (agent + ops worker, loopback only) -------------------------

    def window_open_for(self, clinic_id, to):
        """24 h customer-service window: open iff a patient message exists within
        the last WINDOW_HOURS hours for this clinic+patient."""
        phone = e164(to)
        if self.dry:
            return True, "dry-run"
        ok, rows, err = self.sb.get(
            "patients", select="id", clinic_id=clinic_id, **{"phone": phone}, limit="1"
        )
        if not ok or not rows:
            return False, "unknown_patient"
        pid = rows[0]["id"]
        ok, convs, err = self.sb.get(
            "conversations", select="id", clinic_id=clinic_id, **{"patient_id": pid},
            limit="1", order="updated_at.desc",
        )
        if not ok or not convs:
            return False, "no_conversation"
        cutoff = (now() - timedelta(hours=WINDOW_HOURS)).isoformat()
        ok, msgs, err = self.sb.get(
            "messages", select="id", conversation_id=convs[0]["id"],
            **{"sender": "patient", "created_at": f"gte.{cutoff}"}, limit="1",
        )
        if not ok:
            return False, f"lookup_failed:{(err or '')[:80]}"
        return (len(msgs) > 0), ("open" if msgs else "window_closed")

    def _phone_number_id(self, clinic):
        pnid = clinic.get("wa_phone_number_id")
        if not pnid:
            return None, "clinic_has_no_linked_number"
        return pnid, None

    def _record_outbound(self, clinic_id, conv_patient, to, content, wamids,
                         metadata=None, message_type="text"):
        """Insert the sender='franel' row after a successful Graph send."""
        if self.dry:
            log("DRY", f"record outbound -> {to}: {content[:120]!r}")
            return
        if not conv_patient:
            return
        meta = dict(metadata or {})
        meta["wamids"] = wamids
        row = {
            "conversation_id": conv_patient,
            "sender": "franel",
            "content": content,
            "message_type": message_type,
            "metadata": meta,
            "wa_message_id": wa_msg_id(wamids[0]) if wamids else None,
        }
        self.sb.insert("messages", row)

    def _conversation_for(self, clinic_id, to):
        if self.dry:
            return "dry-conversation"
        phone = e164(to)
        ok, rows, _ = self.sb.get(
            "patients", select="id", clinic_id=clinic_id, **{"phone": phone}, limit="1"
        )
        if not ok or not rows:
            return None
        ok, convs, _ = self.sb.get(
            "conversations", select="id", clinic_id=clinic_id,
            **{"patient_id": rows[0]["id"]}, limit="1", order="updated_at.desc",
        )
        return convs[0]["id"] if convs else None

    def do_send(self, clinic_id, to, text):
        clinic = self.clinic_by_id(clinic_id)
        if not clinic:
            return 404, {"error": "unknown_clinic"}
        if clinic.get("status") == "suspended":
            return 409, {"error": "clinic_suspended"}
        to = e164(to) or to
        text = (text or "").strip()
        if not text:
            return 422, {"error": "empty_text"}
        open_, why = self.window_open_for(clinic_id, to)
        if not open_:
            return 422, {"error": "window_closed", "reason": why}
        pnid, err = self._phone_number_id(clinic)
        if err:
            return 409, {"error": err}
        chunks = split_text(text)
        sent, wamids = 0, []
        for ch in chunks:
            ok, data, e2 = self.graph.send_text(pnid, to, ch)
            if not ok:
                tail = " ".join(chunks[sent:])
                self.enqueue_outbound({
                    "clinic_id": clinic_id, "to": to, "kind": "text",
                    "payload": {"text": tail}, "attempts": 0,
                    "created_at": now_iso(), "last_error": (e2 or "send failed")[:200],
                })
                return 202, {"status": "queued", "reason": (e2 or "send failed")[:200]}
            wamids.append((data or {}).get("messages", [{}])[0].get("id", ""))
            sent += 1
        self._record_outbound(clinic_id, self._conversation_for(clinic_id, to),
                              to, text, wamids)
        self.usage(clinic_id, "outbound_message", ref_type="freeform",
                   ref_id=wamids[0] if wamids else None)
        log("INFO", f"/send ok clinic={clinic_id} to={to} chunks={len(wamids)}")
        return 200, {"wamid": wamids[0] if wamids else None, "wamids": wamids}

    def do_send_template(self, clinic_id, to, template_name, language, components):
        clinic = self.clinic_by_id(clinic_id)
        if not clinic:
            return 404, {"error": "unknown_clinic"}
        if clinic.get("status") == "suspended":
            return 409, {"error": "clinic_suspended"}
        to = e164(to) or to
        template_name = template_name or ""
        if not template_name:
            return 422, {"error": "empty_template_name"}
        maps = clinic.get("wa_templates_status") or {}
        state = maps.get(template_name)
        if isinstance(state, dict) and state.get("status") == "REJECTED":
            return 422, {"error": "template_not_approved", "reason": "rejected_by_meta"}
        pnid, err = self._phone_number_id(clinic)
        if err:
            return 409, {"error": err}
        language = language or "en"
        ok, data, e2 = self.graph.send_template(pnid, to, template_name, language,
                                                components or [])
        if not ok:
            if self._template_error(e2, data):
                return 422, {"error": "template_not_approved",
                             "reason": (e2 or json.dumps(data or {}))[:200]}
            self.enqueue_outbound({
                "clinic_id": clinic_id, "to": to, "kind": "template",
                "payload": {"template_name": template_name, "language": language,
                            "components": components or []},
                "attempts": 0, "created_at": now_iso(),
                "last_error": (e2 or "send failed")[:200],
            })
            return 202, {"status": "queued", "reason": (e2 or "send failed")[:200]}
        wamid = (data or {}).get("messages", [{}])[0].get("id", "")
        self._record_outbound(
            clinic_id, self._conversation_for(clinic_id, to), to,
            f"[template:{template_name}]", [wamid],
            metadata={"kind": "template", "template_name": template_name},
        )
        self.usage(clinic_id, "outbound_message", ref_type="template", ref_id=wamid)
        log("INFO", f"/send-template ok clinic={clinic_id} to={to} {template_name}")
        return 200, {"wamid": wamid or None}

    @staticmethod
    def _template_error(err, data):
        blob = (err or "") + " " + json.dumps(data or {})
        low = blob.lower()
        return ("template" in low and ("not approved" in low or "invalid" in low
                                       or "rejected" in low
                                       or "not found" in low or "131047" in low))

    # ---- onboarding pipeline -------------------------------------------------------

    def do_onboard(self, clinic_id, phone):
        clinic = self.clinic_by_id(clinic_id)
        if not clinic:
            return 404, {"error": "unknown_clinic"}
        phone = e164(phone) or phone
        if not phone:
            return 422, {"error": "empty_phone"}
        if not self.business_id:
            return 500, {"error": "WA_BUSINESS_ID not configured"}
        display_name = clinic.get("name") or "Franel"
        if self.dry:
            log("DRY", f"/onboard clinic={clinic_id} phone={phone} name={display_name!r}")
            return 202, {"status": "queued", "wa_status": "linking"}
        # 1) link the number (idempotent: re-linking a linked number is a no-op error
        #    we treat as already-linked)
        self.upsert_clinic(clinic_id, {"wa_status": "linking", "wa_number": phone})
        ok, data, err = self.graph.link_number(self.business_id, phone, display_name)
        if not ok:
            low = (err or "").lower()
            if "is already linked" in low or "already" in low:
                pnid = (clinic.get("wa_phone_number_id") or "")
            else:
                self.upsert_clinic(clinic_id, {"wa_status": "error"})
                return 502, {"error": "link_failed", "reason": (err or "")[:300]}
        else:
            pnid = (data or {}).get("id", "")
        if not pnid:
            self.upsert_clinic(clinic_id, {"wa_status": "error"})
            return 502, {"error": "link_failed", "reason": "no phone_number_id returned"}
        self.upsert_clinic(clinic_id, {
            "wa_phone_number_id": pnid, "wa_display_name": display_name,
            "wa_status": "name_pending",
        })
        # 2) display name (best-effort; ~24 h propagation, non-blocking)
        self.graph.set_display_name(pnid, display_name)
        # 3) create + submit the 5 utility templates from the clinic's own wording
        ok, cfg, _ = self.sb.get(
            "clinic_config", **{"clinic_id": clinic_id}, limit="1"
        )
        cfg_templates = {}
        if ok and isinstance(cfg, list) and cfg:
            cfg_templates = cfg[0].get("whatsapp_templates") or {}
        maps = dict(clinic.get("wa_templates_status") or {})
        for name, default_text in TEMPLATE_JOB_DEFAULTS:
            text = (cfg_templates.get(name) or default_text).strip()
            ok, data, err = self.graph.create_template(self.business_id, name, "en", text)
            if ok:
                maps.setdefault(name, {"status": "PENDING", "language": "en",
                                       "at": now_iso()})
            else:
                maps[name] = {"status": "SUBMIT_FAILED", "language": "en",
                              "at": now_iso(), "error": (err or "")[:200]}
        self.upsert_clinic(clinic_id, {
            "wa_templates_status": maps, "wa_status": "templates_pending",
            "onboarded_at": now_iso(),
        })
        self.refresh_clinics(force=True)
        log("INFO", f"/onboard clinic={clinic_id} pnid={pnid} templates submitted "
                    f"({len(maps)})")
        return 202, {"status": "queued", "wa_status": "templates_pending",
                     "phone_number_id": pnid}

    # ---- outbox (resilience) --------------------------------------------------------

    def _load_outbox(self):
        try:
            with open(OUTBOX_FILE, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return []

    def _save_outbox(self, outbox):
        try:
            tmp = OUTBOX_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(outbox, f, indent=1)
            os.replace(tmp, OUTBOX_FILE)
            try:
                os.chmod(OUTBOX_FILE, 0o600)
            except OSError:
                pass
        except OSError as e:
            log("WARN", f"outbox save failed: {e}")

    def enqueue_outbound(self, item):
        with self.outbox_lock:
            outbox = self._load_outbox()
            if len(outbox) >= MAX_OUTBOX:
                log("ERROR", f"outbox full ({MAX_OUTBOX}); dropping {item['kind']} "
                             f"for clinic {item['clinic_id']}")
                return
            item.setdefault("id", f"{int(time.time() * 1000)}-{len(outbox)}")
            outbox.append(item)
            self._save_outbox(outbox)
        log("WARN", f"outbound queued {item['kind']} clinic={item['clinic_id']} "
                    f"to={item['to']} (outbox {len(outbox)})")

    def outbox_thread(self):
        while True:
            time.sleep(OUTBOX_CYCLE_S)
            try:
                self._drain_outbox()
            except Exception as e:
                log("ERROR", f"outbox drain crashed: {e!r}")

    def _drain_outbox(self):
        with self.outbox_lock:
            outbox = self._load_outbox()
            if not outbox:
                return
            kept, done = [], 0
            for item in outbox:
                clinic = self.clinic_by_id(item["clinic_id"])
                if clinic is None or clinic.get("status") == "suspended":
                    log("WARN", f"outbox drop clinic={item['clinic_id']} "
                                f"(missing or suspended)")
                    done += 1
                    continue
                if item.get("attempts", 0) >= MAX_OUTBOX_ATTEMPTS:
                    log("ERROR", f"outbox give-up clinic={item['clinic_id']} "
                                 f"to={item.get('to')} after {item['attempts']} attempts")
                    self.usage(item["clinic_id"], "outbound_message",
                               ref_type="dead_letter", ref_id=item.get("id"))
                    done += 1
                    continue
                ok, data, err = self._outbox_send(clinic, item)
                if ok:
                    wamid = (data or {}).get("messages", [{}])[0].get("id", "")
                    if item["kind"] == "text":
                        self._record_outbound(
                            item["clinic_id"],
                            self._conversation_for(item["clinic_id"], item["to"]),
                            item["to"], item["payload"].get("text", ""), [wamid])
                    else:
                        self._record_outbound(
                            item["clinic_id"],
                            self._conversation_for(item["clinic_id"], item["to"]),
                            item["to"],
                            f"[template:{item['payload'].get('template_name')}]",
                            [wamid],
                            metadata={"kind": "template",
                                      "template_name": item["payload"].get("template_name")},
                        )
                    self.usage(item["clinic_id"], "outbound_message",
                               ref_type="freeform" if item["kind"] == "text" else "template",
                               ref_id=wamid)
                    log("INFO", f"outbox delivered {item['kind']} clinic={item['clinic_id']} "
                                f"to={item.get('to')} wamid={wamid}")
                    done += 1
                else:
                    item["attempts"] = item.get("attempts", 0) + 1
                    item["last_error"] = (err or "send failed")[:200]
                    kept.append(item)
            if done:
                self._save_outbox(kept)
        log("INFO", f"outbox drain: {done} delivered/dropped, {len(kept)} pending")

    def _outbox_send(self, clinic, item):
        pnid = clinic.get("wa_phone_number_id")
        if not pnid:
            return False, None, "no phone_number_id"
        if item["kind"] == "text":
            return self.graph.send_text(pnid, item["to"], item["payload"].get("text", ""))
        p = item["payload"]
        return self.graph.send_template(pnid, item["to"], p.get("template_name", ""),
                                        p.get("language", "en"), p.get("components") or [])

    # ---- health ---------------------------------------------------------------------

    def health(self):
        probe_ts, probe = self._token_probe
        if time.time() - probe_ts > TOKEN_PROBE_TTL:
            ok, biz, err = self.graph.token_probe()
            self._token_probe = (time.time(), {"ok": ok, "id": biz, "error": err})
            probe = self._token_probe[1]
        self.refresh_clinics()
        return {
            "ok": True,
            "booted_at": self.booted_at,
            "dry_run": self.dry,
            "last_webhook_age_s": round(time.time() - self.last_webhook_at, 1)
            if self.last_webhook_at else None,
            "clinics_linked": len(self.clinics),
            "clinics_total": len(self.clinics_by_id),
            "outbox_len": len(self._load_outbox()),
            "token": probe,
        }


def verify_signature(secret, raw_body, header):
    """Meta signs the raw body with HMAC-SHA256(app_secret); header may carry a
    'sha256=' prefix. Returns False when a secret is configured and the header
    is missing or mismatched; True when no secret is set (dev)."""
    if not secret:
        return True
    if not header:
        return False
    sig = header.split("=", 1)[1] if "=" in header else header
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig.strip().lower())


class Handler(BaseHTTPRequestHandler):
    gw = None  # set in main()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # quiet stdlib access-log
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/whatsapp":
            q = urllib.parse.parse_qs(parsed.query)
            mode = (q.get("hub.mode") or [""])[0]
            token = (q.get("hub.verify_token") or [""])[0]
            challenge = (q.get("hub.challenge") or [""])[0]
            if mode == "subscribe" and self.gw.verify_token and \
                    hmac.compare_digest(token, self.gw.verify_token):
                body = challenge.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                log("INFO", "webhook verified (hub.challenge echoed)")
            else:
                self._json(403, {"error": "verify_failed"})
            return
        if parsed.path == "/health":
            self._json(200, self.gw.health())
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if parsed.path == "/whatsapp":
            if not verify_signature(self.gw.app_secret, raw,
                                     self.headers.get("x-hub-signature-256")):
                self._json(401, {"error": "bad_signature"})
                return
            try:
                payload = json.loads(raw.decode("utf-8"))
            except ValueError:
                self._json(400, {"error": "bad_json"})
                return
            self._json(200, {"status": "received"})  # ack first: never block Meta
            threading.Thread(target=self.gw.process_webhook, args=(payload,),
                             daemon=True).start()
            return
        if parsed.path in ("/send", "/send-template", "/onboard"):
            if self.gw.gateway_secret:
                auth = (self.headers.get("Authorization") or "").replace("Bearer ", "")
                if not hmac.compare_digest(auth, self.gw.gateway_secret):
                    self._json(401, {"error": "unauthorized"})
                    return
            try:
                body = json.loads(raw.decode("utf-8")) if raw else {}
            except ValueError:
                self._json(400, {"error": "bad_json"})
                return
            if parsed.path == "/send":
                code, out = self.gw.do_send(body.get("clinic_id"),
                                            body.get("to", ""), body.get("text", ""))
            elif parsed.path == "/send-template":
                code, out = self.gw.do_send_template(
                    body.get("clinic_id"), body.get("to", ""),
                    body.get("template_name", ""), body.get("language", "en"),
                    body.get("components"))
            else:
                code, out = self.gw.do_onboard(body.get("clinic_id"),
                                               body.get("phone", ""))
            self._json(code, out)
            return
        self._json(404, {"error": "not_found"})


def main():
    ap = argparse.ArgumentParser(description="Franel platform gateway")
    ap.add_argument("--dry-run", action="store_true",
                    help="no Meta/Supabase writes; fake wamids, log only")
    ap.add_argument("--port", type=int, default=0,
                    help="bind port (default: PORT env or 3001)")
    args = ap.parse_args()
    env = {**load_env(), **os.environ}  # real env wins over the env file
    gw = Gateway(env, dry=args.dry_run)
    Handler.gw = gw
    port = args.port or int(env.get("PORT") or 3001)
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    threading.Thread(target=gw.outbox_thread, daemon=True).start()
    log("INFO", f"franel-gateway up (port {port}, dry_run={args.dry_run}, "
                f"business_id={gw.business_id or 'NOT SET'})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log("INFO", "shutting down")


if __name__ == "__main__":
    main()