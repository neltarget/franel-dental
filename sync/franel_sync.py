#!/usr/bin/env python3
"""Franel sync daemon — mirrors Hermes + Google Calendar state into the
Supabase dashboard, and pushes dashboard actions back to WhatsApp/Calendar.

VPS -> dashboard:
  ~/.hermes/state.db (read-only)          -> patients, conversations, messages
  Google Calendar 'DENTAL APPT ...'       -> appointments
  franel_reminders_state.json no-flags    -> appointments.attendance/status

dashboard -> VPS:
  appointments (metadata.source 'dashboard'/null, no google_event_id)
                                             -> google_api.py calendar create
  appointments status 'cancelled' with a google_event_id
                                             -> google_api.py calendar delete
  messages sender='staff' (wa_message_id NULL) -> bridge POST /send, id back

Idempotent: patient/chat cache, conversation cache, sqlite rowid cursors,
google_event_id dedupe. Stdlib only.
  systemd: franel-sync.service   |   once: python3 franel_sync.py --once
  dry run: python3 franel_sync.py --once --dry-run
"""

import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

HERMES = os.path.expanduser("~/.hermes")
GAPI = os.path.join(HERMES, "skills/productivity/google-workspace/scripts/google_api.py")
STATE_DB = os.path.join(HERMES, "state.db")
REMINDER_STATE = os.path.join(HERMES, "data/franel_reminders_state.json")
ENV_FILE = os.path.expanduser("~/.config/franel-sync.env")
BASE = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE, "state.json")
LOCK_FILE = os.path.join(BASE, "sync.lock")
LOG_FILE = os.path.join(BASE, "sync.log")

DB_CYCLE_S = 5
CAL_CYCLE_S = 60
CAL_PAST_DAYS = 7
CAL_FUT_DAYS = 30
BATCH = 200
MAX_LOG_LINES = 5000

SUMMARY_PREFIX = "DENTAL APPT"
APPT_RE = re.compile(
    rf"^{re.escape(SUMMARY_PREFIX)}\s+[\u2014\u2013\-]+\s*(.+?)\s+[\u2014\u2013\-]+\s*(.+?)\s*$"
)
DESC_KEY_RE_TPL = r"(?im)^\s*{k}\s*:\s*(.+?)\s*$"

SERVICE_DURATION_MIN = {
    "General dental consultation": 30,
    "Child dental examination": 30,
    "Emergency assessment": 30,
    "Scaling and polishing": 45,
    "Teeth whitening": 60,
    "Composite filling": 45,
    "Root canal treatment": 90,
    "Crowns and bridges": 60,
    "Veneers": 45,
    "Fixed braces": 45,
    "Clear aligners": 45,
    "Dental implants": 45,
}
DEFAULT_DURATION_MIN = 30


def now():
    return datetime.now(timezone.utc)


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
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.write("".join(tail))
    except OSError:
        pass


def load_env(path):
    env = {}
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


class SB:
    """Minimal PostgREST client (service_role bypasses RLS)."""

    _NON_FILTER = frozenset({"select", "order", "limit", "offset", "on_conflict"})
    _OP_RE = re.compile(
        r"^(not[.(]|\(|(?:eq|neq|gt|gte|lt|lte|in|is|cs|like|ilike|sl|sr|overlaps|"
        r"match|fts|plfts|phfts|imatches)\.)"
    )

    def __init__(self, url, key):
        self.url = url.rstrip("/")
        self.key = key

    def _norm(self, params):
        # This PostgREST rejects implicit "col=value" filters (PGRST100);
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


_gapi_py = None


def gapi_python():
    """Interpreter that can import googleapiclient (Hermes venv, else system)."""
    global _gapi_py
    if _gapi_py:
        return _gapi_py
    cands = []
    ov = load_env(ENV_FILE).get("FRANEL_GAPI_PYTHON", "").strip()
    if ov:
        cands.append(ov)
    cands.append(os.path.join(HERMES, "hermes-agent/venv/bin/python3"))
    cands.append("python3")
    for c in cands:
        if c != "python3" and not os.path.isfile(c):
            continue
        try:
            r = subprocess.run([c, "-c", "import googleapiclient"],
                               capture_output=True, timeout=30)
            if r.returncode == 0:
                _gapi_py = c
                break
        except Exception:
            continue
    if not _gapi_py:
        _gapi_py = "python3"
    log("INFO", f"gapi interpreter: {_gapi_py}")
    return _gapi_py


def gapi(*args):
    try:
        r = subprocess.run(
            [gapi_python(), GAPI, *args], capture_output=True, text=True, timeout=120
        )
    except Exception as e:
        return False, None, str(e)[:300]
    if r.returncode != 0:
        return False, None, (r.stderr or r.stdout or "")[-300:]
    return True, r.stdout, None


def calendar_list(start, end):
    ok, out, err = gapi("calendar", "list", "--start", start.isoformat(),
                        "--end", end.isoformat())
    if not ok:
        return False, None, err
    try:
        data = json.loads(out)
    except ValueError:
        return False, None, "calendar list output not JSON"
    items = data if isinstance(data, list) else (data or {}).get("items", [])
    return True, items, None


def calendar_create(summary, start, end, description):
    ok, out, err = gapi(
        "calendar", "create",
        "--summary", summary,
        "--start", start.isoformat(),
        "--end", end.isoformat(),
        "--description", description,
    )
    if not ok:
        return None, err or "create failed"
    try:
        data = json.loads(out)
        if isinstance(data, str):
            return data, None
        if isinstance(data, dict):
            return data.get("id") or next(
                (k for k in data if "id" in k.lower()), None), None
    except ValueError:
        pass
    m = re.search(r'"id"\s*:\s*"([^"]+)"', out or "")
    if m:
        return m.group(1), None
    return None, (out or "").strip()[:200]


def calendar_delete(event_id):
    return gapi("calendar", "delete", event_id)


def bridge_send(base, chat_id, text):
    if len(text) > 4000:
        text = text[:3980] + " \u2026"
    ok, data, err = bridge_req(base, "/send", {"chatId": chat_id, "message": text})
    if ok and isinstance(data, dict) and data.get("success") is True:
        return data.get("messageId") or None, None
    return None, (err or json.dumps(data)[:200] if data is not None else err)


def bridge_req(base, path, body=None):
    url = base.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return True, (json.loads(raw) if raw else None), None
    except urllib.error.HTTPError as e:
        return False, None, f"HTTP {e.code}: {e.read().decode(errors='replace')[:200]}"
    except Exception as e:
        return False, None, str(e)[:200]


def parse_dt(v):
    if isinstance(v, dict):
        v = v.get("dateTime") or v.get("date")
    if not v:
        return None
    try:
        d = datetime.fromisoformat(v)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except ValueError:
        return None


def parse_event(e):
    """Same summary/description contract as franel_reminders.py — keep in sync."""
    m = APPT_RE.match((e.get("summary") or "").strip())
    if not m:
        return None
    t0 = parse_dt(e.get("start"))
    if t0 is None:
        return None
    t1 = parse_dt(e.get("end")) or (t0 + timedelta(hours=1))
    desc = e.get("description") or ""

    def key(k):
        mm = re.search(DESC_KEY_RE_TPL.format(k=re.escape(k)), desc)
        return mm.group(1).strip() if mm else ""

    wa = re.sub(r"\s+", " ", key("WhatsApp")).strip()
    chat = ""
    mm = re.match(r"\S+(?:@lid|@s\.whatsapp\.net|@c\.us)", wa)
    if mm:
        chat = mm.group(0)
    else:
        mm = re.search(r"\+?\d[\d\s\-()]{7,19}\d", wa)
        if mm:
            d = re.sub(r"\D", "", mm.group(0))
            if len(d) == 12 and d.startswith("233"):
                chat = d + "@c.us"
            elif len(d) == 10 and d.startswith("0"):
                chat = "233" + d[1:] + "@c.us"
            elif len(d) == 9:
                chat = "233" + d + "@c.us"
    return {
        "id": e.get("id"),
        "name": m.group(1).strip(),
        "service": m.group(2).strip(),
        "t0": t0,
        "t1": t1,
        "chat": chat,
        "email": key("Email"),
        "context": key("Context"),
        "patient_line": key("Patient"),
    }


def chat_to_phone(chat_id):
    if not chat_id or chat_id.endswith(("@lid", "@s.whatsapp.net")):
        return ""
    digits = re.sub(r"\D", "", chat_id.split("@")[0])
    return digits if len(digits) >= 10 else ""


SESSION_KEY_PHONE_RE = re.compile(r"dm[:/](\d{9,13})$")


def session_key_phone(skey):
    mm = SESSION_KEY_PHONE_RE.search(skey or "")
    return mm.group(1) if mm else ""


DEFAULT_STATE = {
    "patient_by_chat": {},
    "conv_by_patient": {},
    "msg_cursor": {},
    "cal_seen_event_ids": [],
    "last_cal_scan": 0.0,
    "log_stats": {},
    "dead_send": {},
}


class Ctx:
    def __init__(self, dry_run=False):
        self.dry = dry_run
        env = load_env(ENV_FILE)
        self.sb = SB(env.get("SUPABASE_URL", ""), env.get("SUPABASE_SERVICE_KEY", ""))
        self.clinic_id = env.get("FRANEL_CLINIC_ID", "")
        self.bridge_url = env.get("BRIDGE_URL", "http://localhost:3000")
        self.state = {k: json.loads(json.dumps(v)) for k, v in DEFAULT_STATE.items()}
        try:
            with open(STATE_FILE, encoding="utf-8") as f:
                loaded = json.load(f)
            for k in self.state:
                if k in loaded:
                    self.state[k] = loaded[k]
        except (OSError, ValueError):
            pass

    def save(self):
        try:
            tmp = STATE_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.state, f, indent=1)
            os.replace(tmp, STATE_FILE)
        except OSError as e:
            log("WARN", f"state save failed: {e}")


def ensure_patient(ctx, chat_id, name="", key_phone=""):
    if not chat_id:
        return None
    cache = ctx.state["patient_by_chat"]
    pid = cache.get(chat_id)
    if pid:
        return pid
    ok, data, err = ctx.sb.get(
        "patients", clinic_id=ctx.clinic_id, wa_chat_id=chat_id, select="id", limit="1"
    )
    if not ok or not isinstance(data, list):
        log("WARN", f"patient lookup failed ({chat_id}): {err}")
        return None
    if data:
        pid = data[0]["id"]
        cache[chat_id] = pid
        ctx.save()
        return pid
    if ctx.dry:
        log("DRY", f"create patient for {chat_id} ({name})")
        return None
    phone = chat_to_phone(chat_id) or (
        key_phone if len(key_phone) >= 10 else "") or None
    row = {
        "clinic_id": ctx.clinic_id,
        "wa_chat_id": chat_id,
        "name": (name or "WhatsApp patient").strip(),
        "phone": phone,
        "email": None,
        "source": "whatsapp",
        "notes": None,
    }
    ok, data, err = ctx.sb.insert("patients", row)
    if ok and isinstance(data, list) and data and data[0].get("id"):
        pid = data[0]["id"]
        cache[chat_id] = pid
        ctx.save()
        log("INFO", f"patient created {chat_id} -> {pid}")
        return pid
    log("WARN", f"patient create failed ({chat_id}): {err or data}")
    return None


def ensure_conversation(ctx, patient_id):
    if not patient_id:
        return None
    cache = ctx.state["conv_by_patient"]
    cid = cache.get(patient_id)
    if cid:
        return cid
    ok, data, err = ctx.sb.get(
        "conversations", clinic_id=ctx.clinic_id, patient_id=patient_id,
        select="id", limit="1", order="created_at.asc",
    )
    if not ok or not isinstance(data, list):
        log("WARN", f"conversation lookup failed ({patient_id}): {err}")
        return None
    if data:
        cid = data[0]["id"]
        cache[patient_id] = cid
        ctx.save()
        return cid
    if ctx.dry:
        log("DRY", f"create conversation for patient {patient_id}")
        return None
    row = {
        "clinic_id": ctx.clinic_id,
        "patient_id": patient_id,
        "status": "new",
        "intent": None,
        "service_interest": None,
        "lead_level": None,
        "last_message_at": None,
        "last_message_preview": None,
        "assigned_staff_id": None,
    }
    ok, data, err = ctx.sb.insert("conversations", row)
    if ok and isinstance(data, list) and data and data[0].get("id"):
        cid = data[0]["id"]
        cache[patient_id] = cid
        ctx.save()
        log("INFO", f"conversation created for {patient_id} -> {cid}")
        return cid
    log("WARN", f"conversation create failed ({patient_id}): {err or data}")
    return None


def message_wa_id(rowid, platform_id):
    p = (platform_id or "").strip()
    if p and p not in ("0", "None", "null", ""):
        return f"msg-{p}"
    return f"hermes-row-{rowid}"


def sync_conversations(ctx):
    try:
        con = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True)
        cur = con.cursor()
        cur.execute(
            "SELECT id, chat_id, display_name, session_key FROM sessions "
            "WHERE source='whatsapp' AND chat_type='dm'"
        )
        sessions = cur.fetchall()
    except Exception as e:
        log("WARN", f"state.db sessions read failed: {e}")
        return
    for sid, chat_id, display_name, skey in sessions:
        pid = ensure_patient(ctx, chat_id, display_name or "",
                             key_phone=session_key_phone(skey))
        if not pid:
            continue
        cid = ensure_conversation(ctx, pid)
        if not cid:
            continue
        cursor_key = f"conv-{cid}"
        last_rowid = ctx.state["msg_cursor"].get(cursor_key, 0)
        try:
            try:
                cur.execute(
                    "SELECT rowid, role, content, timestamp, platform_message_id "
                    "FROM messages WHERE session_id=? AND rowid > ? "
                    "ORDER BY rowid ASC LIMIT ?",
                    (sid, last_rowid, BATCH),
                )
                rows = cur.fetchall()
            except Exception:
                last_ts = ctx.state["msg_cursor"].get(cursor_key, 0)
                cur.execute(
                    "SELECT 0, role, content, timestamp, platform_message_id "
                    "FROM messages WHERE session_id=? AND timestamp > ? "
                    "ORDER BY timestamp ASC LIMIT ?",
                    (sid, last_ts, BATCH),
                )
                rows = cur.fetchall()
        except Exception as e:
            log("WARN", f"message read failed ({chat_id}): {e}")
            continue
        new = 0
        for rowid, role, content, ts, pid_ in rows:
            if role not in ("user", "assistant"):
                continue
            sender = "patient" if role == "user" else "franel"
            if isinstance(content, (bytes, bytearray)):
                content = content.decode("utf-8", "replace")
            content = (content or "").strip()
            if not content:
                continue
            if not ctx.dry:
                mid = message_wa_id(rowid, pid_)
                ok2, d2, _e2 = ctx.sb.get(
                    "messages",
                    select="id",
                    conversation_id=cid,
                    **{"wa_message_id": f"eq.{mid}"},
                    limit="1",
                )
                dup = bool(ok2 and d2)
                if not dup:
                    ok, _data, err = ctx.sb.insert("messages", {
                        "conversation_id": cid,
                        "sender": sender,
                        "staff_id": None,
                        "content": content,
                        "message_type": "text",
                        "metadata": {"hermes_session": sid},
                        "wa_message_id": mid,
                    })
                    if not ok:
                        msg = str(err or "")[:300]
                        if "23505" in msg or "duplicate" in msg or "409" in msg:
                            pass  # raced identical insert — cursor still advances
                        else:
                            log("WARN", f"message insert failed ({sid}): {msg}")
                            break
            else:
                log("DRY", f"message {sender} in {cid}: {content[:60]}")
            new += 1
            if ts is not None and rowid:
                ctx.state["msg_cursor"][cursor_key] = max(last_rowid, rowid)
            elif ts is not None:
                ctx.state["msg_cursor"][cursor_key] = max(
                    ctx.state["msg_cursor"].get(cursor_key, 0), float(ts)
                )
            preview = content[:80]
            if not ctx.dry:
                ctx.sb.update(
                    "conversations",
                    {"last_message_at": now().isoformat(), "last_message_preview": preview},
                    {"id": cid},
                )
        if new:
            log_state = ctx.state["log_stats"].get(chat_id, 0) + new
            ctx.state["log_stats"][chat_id] = log_state
            if log_state <= 3 or log_state % 25 == 0:
                log("INFO", f"mirrored {new} messages from {chat_id} (total {log_state})")
            ctx.save()
    try:
        con.close()
    except Exception:
        pass


def sync_calendar(ctx):
    t0 = now() - timedelta(days=CAL_PAST_DAYS)
    t1 = now() + timedelta(days=CAL_FUT_DAYS)
    ok, items, err = calendar_list(t0, t1)
    if not ok or items is None:
        log("WARN", f"calendar list failed: {err}")
        return
    seen = ctx.state["cal_seen_event_ids"]
    seen_set = set(seen)
    in_cal = set()
    for e in items:
        p = parse_event(e)
        if not p or not p.get("id"):
            continue
        in_cal.add(p["id"])
        if p["id"] in seen_set:
            continue
        seen_set.add(p["id"])
        pid = ensure_patient(ctx, p["chat"], p["name"] or p["patient_line"])
        if not pid:
            continue
        cid = ensure_conversation(ctx, pid) or None
        if ctx.dry:
            log("DRY", f"create appointment {p['name']} {p['service']} {p['t0']}")
            continue
        row = {
            "clinic_id": ctx.clinic_id,
            "patient_id": pid,
            "conversation_id": cid,
            "appointment_date": p["t0"].strftime("%Y-%m-%d"),
            "appointment_time": p["t0"].strftime("%H:%M"),
            "service": p["service"] or "Consultation",
            "status": "confirmed",
            "attendance": "pending",
            "marked_by": None,
            "marked_at": None,
            "notes": p["context"] or None,
            "metadata": {
                "google_event_id": p["id"],
                "source": "whatsapp",
                "synced_at": now().isoformat(),
            },
        }
        ok, data, err = ctx.sb.insert("appointments", row)
        if ok and isinstance(data, list) and data and data[0].get("id"):
            log("INFO", f"appointment mirrored {p['name']} {p['t0']} ({p['service']})")
            if cid and p["t0"] > now():
                ctx.sb.update(
                    "conversations",
                    {"status": "booked"},
                    {"or": f"(status.eq.new,status.eq.qualified).and.(id.eq.{cid})"},
                )
        else:
            log("WARN", f"appointment insert failed ({p['id']}): {err or data}")
    # events removed in Calendar -> cancel the local row (merge metadata, keep event id)
    # only within scan coverage — rows older than the window are out of view, not deleted
    if not ctx.dry:
        ok, rows, err = ctx.sb.get(
            "appointments", clinic_id=ctx.clinic_id, select="id,metadata,status,appointment_date"
        )
        if ok and isinstance(rows, list):
            in_cal_set = in_cal
            window_floor = (now() - timedelta(days=CAL_PAST_DAYS)).strftime("%Y-%m-%d")
            for r in rows:
                meta = r.get("metadata") or {}
                eid = meta.get("google_event_id")
                if not eid or r.get("status") not in ("pending", "confirmed"):
                    continue
                if (r.get("appointment_date") or "") < window_floor:
                    continue
                if eid not in in_cal_set:
                    meta2 = dict(meta)
                    meta2["cancelled_via"] = "calendar_delete"
                    ctx.sb.update(
                        "appointments",
                        {"status": "cancelled", "attendance": "cancelled",
                         "marked_by": "system", "marked_at": now().isoformat(),
                         "metadata": meta2},
                        {"id": r['id']},
                    )
                    log("INFO", f"appointment cancelled via calendar delete {eid[:20]}")
    ctx.state["cal_seen_event_ids"] = sorted(in_cal | set(ctx.state["cal_seen_event_ids"]))


def load_no_show_flags():
    try:
        with open(REMINDER_STATE, encoding="utf-8") as f:
            st = json.load(f)
    except (OSError, ValueError):
        return []
    flags = []

    def walk(o):
        if isinstance(o, dict):
            if o.get("no_show") is True:
                for k in ("event_id", "id", "summary", "key", "pattern", "chat"):
                    v = o.get(k)
                    if isinstance(v, str) and v:
                        flags.append(v)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(st)
    return flags


def mirror_no_shows(ctx):
    flags = load_no_show_flags()
    if not flags:
        return
    ok, rows, err = ctx.sb.get(
        "appointments", clinic_id=ctx.clinic_id, select="id,metadata,status"
    )
    if not ok or not isinstance(rows, list):
        return
    for r in rows:
        if r.get("status") == "no-show":
            continue
        meta = r.get("metadata") or {}
        eid = meta.get("google_event_id") or ""
        hit = any(f == eid or (len(f) > 8 and (f in eid or eid in f)) for f in flags)
        if not hit:
            continue
        if ctx.dry:
            log("DRY", f"flag no-show {r['id']}")
            continue
        meta2 = dict(meta)
        meta2["no_show"] = True
        ctx.sb.update(
            "appointments",
            {"status": "no-show", "attendance": "no-show",
             "marked_by": "system", "marked_at": now().isoformat(),
             "metadata": meta2},
            {"id": r['id']},
        )
        log("INFO", f"appointment flagged no-show {r['id']}")


def service_duration(service):
    for k, v in SERVICE_DURATION_MIN.items():
        if k.lower().split() and (
            k.lower() in (service or "").lower() or (service or "").lower() in k.lower()
        ):
            return v
    return DEFAULT_DURATION_MIN


def claim_dashboard_appointments(ctx):
    q = (
        "(metadata->>source.is.null,metadata->>source.eq.dashboard)"
        ".and.(metadata->>google_event_id.is.null)"
    )
    ok, rows, err = ctx.sb.get(
        "appointments",
        clinic_id=ctx.clinic_id,
        select="*,patients(wa_chat_id,name),conversations(id)",
        **{"or": q},
        status="neq.cancelled",
        order="created_at.asc",
        limit="20",
    )
    if not ok or not isinstance(rows, list):
        if err:
            log("WARN", f"claim lookup failed: {err}")
        return
    for r in rows:
        aid = r.get("id")
        if not aid:
            continue
        pat = (r.get("patients") or {}).get("wa_chat_id") or ""
        pname = (r.get("patients") or {}).get("name") or "Patient"
        service = r.get("service") or "Consultation"
        date = (r.get("appointment_date") or "").strip()
        hms = (r.get("appointment_time") or "09:00").strip()
        try:
            st = datetime.strptime(f"{date} {hms[:5]}", "%Y-%m-%d %H:%M").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            log("WARN", f"claim {aid}: bad datetime {date!r} {hms!r}")
            continue
        et = st + timedelta(minutes=service_duration(service))
        summary = f"{SUMMARY_PREFIX} \u2014 {pname} \u2014 {service}"
        desc = (
            f"Patient: {pname}\n"
            + (f"WhatsApp: {pat}\n" if pat else "")
            + "Context: booked via dashboard"
        )
        if ctx.dry:
            log("DRY", f"create calendar event for {aid}: {summary} {st}")
            continue
        eid, cerr = calendar_create(summary, st, et, desc)
        if not eid:
            log("WARN", f"calendar create failed for {aid}: {cerr}")
            continue
        meta = dict(r.get("metadata") or {})
        meta["google_event_id"] = eid
        meta["source"] = "dashboard"
        meta["synced_at"] = now().isoformat()
        ctx.sb.update(
            "appointments",
            {"status": "confirmed", "metadata": meta},
            {"id": aid},
        )
        conv_id = r.get("conversation_id")
        if conv_id:
            ctx.sb.update(
                "conversations",
                {"status": "booked"},
                {"or": f"(status.eq.new,status.eq.qualified).and.(id.eq.{conv_id})"},
            )
        log("INFO", f"dashboard booking {aid} claimed -> cal event {eid[:20]}")
        if pat:
            ok, data, serra = bridge_req(ctx.bridge_url, "/send", {
                "chatId": pat,
                "message": (
                    f"Hi\u202f{pname.split()[0]}\u202f\u2705 Your {service.lower()} has been booked "
                    f"at our Accra clinic on {date} at {hms[:5]}. "
                    f"Please reply here to confirm or reschedule."
                ),
            })
            if ok:
                log("INFO", f"confirmation WA sent to {pat}")
            else:
                warn = str(serra)[:120]
                if "HTTP 503" not in warn:
                    log("INFO", f"WA confirm pending (bridge {warn})")


def sync_dashboard_cancels(ctx):
    """Dashboard cancelled a row that has a calendar event -> delete event once."""
    ok, rows, err = ctx.sb.get(
        "appointments",
        clinic_id=ctx.clinic_id,
        select="id,metadata,status,appointment_date",
        status="cancelled",
        limit="50",
    )
    if not ok or not isinstance(rows, list):
        return
    for r in rows:
        meta = r.get("metadata") or {}
        eid = meta.get("google_event_id")
        if not eid or meta.get("cal_deleted"):
            continue
        if ctx.dry:
            log("DRY", f"delete calendar event {eid[:20]} for cancelled {r['id']}")
            continue
        dok, dout, derr = calendar_delete(eid)
        meta2 = dict(meta)
        if dok:
            meta2["cal_deleted"] = True
            ctx.sb.update("appointments", {"metadata": meta2}, {"id": r['id']})
            log("INFO", f"cancelled booking {r['id']}: calendar event {eid[:20]} deleted")
        else:
            log("WARN", f"calendar delete failed for {r['id']} ({eid[:20]}): {derr} (retry next cycle)")


def send_staff_messages(ctx):
    ok, rows, err = ctx.sb.get(
        "messages",
        select="id,conversation_id,content",
        sender="staff",
        **{"wa_message_id": "is.null"},
        limit="25",
    )
    if not ok or not isinstance(rows, list):
        if err:
            log("WARN", f"staff message lookup failed: {err}")
        return
    if not rows:
        return
    # batch-resolve conversation_id -> patient wa_chat_id
    conv_ids = []
    for r in rows:
        if r.get("conversation_id") and r["conversation_id"] not in conv_ids:
            conv_ids.append(r["conversation_id"])
    conv2chat = {}
    if conv_ids:
        ok, crows, cerr = ctx.sb.get(
            "conversations", select="id,patient_id,patients(wa_chat_id)", limit="100"
        )
        if ok and isinstance(crows, list):
            for c in crows:
                cid2 = c.get("id")
                pat = c.get("patients") or {}
                chat = pat.get("wa_chat_id") or ""
                if cid2 and chat:
                    conv2chat[cid2] = chat
    dead = ctx.state.setdefault("dead_send", {})
    for r in rows:
        mid = r.get("id")
        chat = conv2chat.get(r.get("conversation_id"), "")
        content = (r.get("content") or "").strip()
        if not mid or not content or mid in dead:
            continue
        if not chat:
            if not ctx.dry:
                ctx.sb.update(
                    "messages",
                    {"metadata": {"send_error": "patient has no WhatsApp chat id"}},
                    {"id": mid},
                )
                dead[mid] = 99
                ctx.save()
            continue
        if ctx.dry:
            log("DRY", f"send WA {chat}: {content[:60]}")
            continue
        waid, serr = bridge_send(ctx.bridge_url, chat, content)
        if waid:
            ctx.sb.update("messages", {"wa_message_id": f"send-{waid}"}, {"id": mid})
            log("INFO", f"staff message {mid} delivered to {chat} (wa {waid})")
        else:
            warn = str(serr)[:120]
            if "HTTP 503" in warn:
                continue  # bridge down — retry next cycle
            attempts = dead.get(mid, 0) + 1
            dead[mid] = attempts
            ctx.save()
            final = attempts >= 8
            ctx.sb.update(
                "messages",
                {"metadata": {"send_error": warn, "send_attempts": attempts}},
                {"id": mid},
            )
            log("WARN", f"staff message {mid} send failed ({attempts}/8): {warn}{' — giving up' if final else ''}")


# ── main loop ────────────────────────────────────────────────────────────────
def cycle(ctx):
    import time as _t
    last_cal = ctx.state.get("last_cal_scan", 0.0)
    _t0 = _t.time()
    sync_conversations(ctx)
    if _t0 - last_cal >= CAL_CYCLE_S or last_cal == 0:
        sync_calendar(ctx)
        mirror_no_shows(ctx)
        ctx.state["last_cal_scan"] = _t0
        ctx.save()
    claim_dashboard_appointments(ctx)
    sync_dashboard_cancels(ctx)
    send_staff_messages(ctx)


def run(ctx, once=False):
    import fcntl
    lock = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except Exception:
        log("WARN", "another franel-sync is running; exiting")
        return
    import traceback as _tb
    while True:
        try:
            cycle(ctx)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            log("ERROR", f"cycle failed: {e}\n{_tb.format_exc()}")
        if once:
            break
        import time as _t
        _t.sleep(DB_CYCLE_S)


def main():
    once = "--once" in sys.argv
    dry = "--dry-run" in sys.argv
    ctx = Ctx(dry_run=dry)
    if not ctx.sb.url or not ctx.sb.key or not ctx.clinic_id \
            or "__" in ctx.sb.key:
        log("ERROR",
            f"missing config in {ENV_FILE} (need SUPABASE_URL, "
            "SUPABASE_SERVICE_KEY, FRANEL_CLINIC_ID)")
        return 2
    log("INFO", f"franel-sync starting (once={once}, dry={dry})")
    run(ctx, once=once)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)