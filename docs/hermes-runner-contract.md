# Hermes runner contract (per-clinic agent) — v1

Cross-boundary contract for implementing the Franel agent runner **inside the Hermes
codebase** (out of scope for this repo; this file is the spec both sides build against).
Companion: `docs/franel-platform-plan.md` §4.3 (decision 2A/1A).

Roles:
- **Franel repo side (this repo + VPS deploy scripts):** installs/starts/stops the agent
  unit, renders the per-clinic `SKILL.md`, maintains `~/.hermes/clinics/<id>/` layout,
  owns everything in Supabase and the gateway.
- **Hermes side (hermes-agent repo):** reads this contract; becomes multi-clinic by
  parameterizing its config paths and swapping its two bad-citizen dependencies
  (`state.db` ingest, reminders-state JSON) for Supabase.

---

## 1. Per-clinic file layout (created by Franel deploy script)

```
~/.hermes/
  hermes-agent/            # shared code + venv (unchanged)
  clinics/
    <clinic-uuid>/
      SKILL.md             # Franel-rendered, identity+behaviour ONLY (see §5)
      clinic.env           # mode 600, Franel-rendered:
      data/                # agent scratch (stt temp files, etc.)
      run/                 # ports/sockets/PIDs if the agent needs them
~/.config/franel-shared.env   # mode 600, shared Secret file (all clinics):
      SUPABASE_URL, SUPABASE_SERVICE_KEY, GATEWAY_URL, STT config
```

- `SOUL.md` (agent persona/identity) stays **platform-level** in the hermes-agent repo —
  never per-clinic. Per-clinic personality differences are expressed in `SKILL.md`
  behaviour rules + the clinic facts the agent *reads* (not files it memorizes).
- The agent process is started by a systemd **user** unit
  `franel-agent-<clinic-uuid>.service` (Franel-provided template + install step in the
  create-clinic flow). `Restart=on-failure`, `WantedBy=default.target`, same pattern as
  `franel-sync.service`/`franel-gateway.service`.
- Short-id convention: unit/paths use the full UUID; logs may abbreviate (first 6 hex).

## 2. Config surface the agent receives

Per-clinic (`<clinic-uuid>/clinic.env`):

```
FRANEL_CLINIC_ID=<uuid>
GAPI_CALENDAR_ID=<google calendar id>     # informational; the agent does NOT call gapi
WA_NUMBER=<E.164>                          # for logging/correlation only
```

Shared (read-only for the agent): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`GATEWAY_URL` (default `http://localhost:3001`).

What the agent **must not** hold: Meta tokens, Graph credentials, Baileys sessions,
direct Calendar API credentials. (V1 enforcement: those simply aren't in these files;
the hermes-agent code paths that used them — the old WhatsApp bridge tool, direct
calendar calls — are removed/disabled for Franel runners.)

## 3. Supabase read contract (decision 2A)

The agent authenticates with the **service key** (it is platform infrastructure; RLS
remains the tenant boundary *for clinic staff*, not for the agent).

### 3.1 Static clinic facts — cached, invalidated on write

One query, cached in-process **30–60 s TTL**, and **immediately invalidated** when the
returned `clinics.settings_version` changes between reads:

```sql
SELECT c.id, c.name, c.address, c.phone, c.email,
       c.services, c.opening_hours,          -- the exact columns already used today
       c.settings_version,
       cc.follow_up_intervals, cc.reminder_hours_before,
       cc.checkin_hours_after, cc.checkin_flag_timeout_hours,
       cc.whatsapp_templates
FROM clinics c JOIN clinic_config cc ON cc.clinic_id = c.id
WHERE c.id = $1;
```

- The `settings_version` bump (row trigger from migration `0005`) means: a dashboard or
  console save is visible to the agent **≤ 1 s** — a setting change changes the next
  ticker's behaviour with no deploy and no file re-render.
- `whatsapp_templates` (the clinic's own reminder/follow-up wording) is read here, NOT
  stored in `SKILL.md`.

### 3.2 Live patient state — every turn, never cached across turns

For an inbound message from phone `P` in clinic `C`:

```
patients        WHERE clinic_id=C AND phone=P          (identity + notes)
conversations   WHERE clinic_id=C AND patient_id=<pid>  (status, lead, intent)
messages        WHERE conversation_id=<cid> ORDER BY created_at DESC LIMIT 30
appointments    WHERE clinic_id=C AND patient_id=<pid>   (upcoming + last 3 past)
escalations     WHERE clinic_id=C AND patient_id=<pid> AND status='open'
follow_ups      WHERE clinic_id=C AND patient_id=<pid> AND status='pending'
```

Booking availability: query the clinic's **appointments** within `opening_hours`
for the candidate slot (existing behaviour — the calendar is the *write* source of
truth via the ops worker; the agent checks Supabase, which the ops worker keeps
fresh every 60 s). Slot offering must respect `opening_hours` (already implemented).

### 3.3 No `state.db` reads

The hermes-agent's old `sessions`/`messages` SQLite ingest (the Baileys-era contract)
is **retired** for Franel runners. If Hermes keeps `state.db` internally for its own
logging, Franel code and Franel dashboards never read it — the contract surface is
Supabase-only.

## 4. Supabase write contract

All writes with the service key. Conventions (mirror existing rows so the dashboard
needs no changes):

| Event | Table/row | Key fields |
|---|---|---|
| Inbound patient message arrives at the agent | `messages` | `sender='patient'`, `wa_message_id` (gateway-set — agent must NOT re-insert; the **gateway** owns patient-message inserts), `conversation_id` (gateway-upserted) |
| Agent reply (in-window free-form) | `messages` after successful `GATEWAY /send` | `sender='franel'`, `content`, `staff_id=NULL`; the gateway returns the `wamid` → store as `wa_message_id='msg-<wamid>'` |
| Agent reply (template) | `messages` after successful `/send-template` | same, plus `metadata.kind='template'`, `metadata.template_name` |
| **Booking** | `appointments` INSERT | `metadata.source='agent'`, NO `google_event_id` (the ops-worker claim funnel at `franel_sync.py:748-828` is the only Calendar writer), `status='pending'` until the ops worker confirms the Calendar event exists (it may flip to `confirmed`), `notes` = context line |
| **Booking side-effect** | `conversations` UPDATE | `status='booked'` (only from `new|qualified`, same guard as :646-649) |
| **No-show** (cron, post-visit) | `appointments` UPDATE | `status='no-show'`, `attendance='no-show'`, `marked_by='system'`, `marked_at=now()` — written **directly** (the old `franel_reminders_state.json` mirror is dead) |
| **Escalation** | `escalations` INSERT/UPDATE | existing tier 1–3 shape (unchanged) |
| **Follow-up send** | `follow_ups` UPDATE | status `pending → sent/skipped`, `sent_at`, `skip_reason` (see §6) |
| **Metering** | `usage_events` INSERT | `kind='llm_call'` per LLM turn (one row/turn; `ref_id`=conversation_id) |
| **Liveness** | `clinics.agent_heartbeat_at=now()` | every 5 min (one-liner; if the column is absent on an old Supabase, skip silently) |

Rules:
- **Never** delete rows. Corrections are status/metadata updates.
- **Never** insert `patients`/`conversations` on first inbound — the gateway upserts
  them before the agent is invoked (single-writer per table: gateway=payload, agent=
  derived state, ops worker=calendar projection). If the agent finds no conversation
  row (racy first message), it waits one cycle (≤ 5 s) before replying; do not create.
- **Never** touch `messages` for staff sends (ops worker's job, decision 1A).

## 5. `SKILL.md` format (identity + behaviour only)

Franel renders `clinics/<uuid>/SKILL.md` at onboarding and re-renders only on
**identity** changes (clinic name, owner/brand voice) — not on setting changes
(settings are read live per §3.1). Template:

```md
# Franel — {clinic name}
You are Franel, the {clinic name} front desk. You operate the clinic's WhatsApp
line {WA_NUMBER}. Read the clinic's live profile (services, prices, hours,
templates) from Supabase on every turn — SOUL.md and this file never contain
current prices, hours, or template text.

## Behaviour rules (identity-level only)
- Qualify, book, remind, follow up; escalate per SOUL.md tiers.
- Never invent services, prices, or availability. Unknown = check live profile.
- Voice notes arrive as transcripts; label them as such to staff, not to patients.
- Images: acknowledge only (POC).
- All outgoing messages go through the gateway tools (see §7).
- Cron jobs re-check patient state before any send (see §6).

## Clinic voice (rendered from clinics.profile_voice at onboarding, editable later)
<2–4 sentences of the clinic's tone, e.g. warm + professional for {name}>
```

What must **not** appear in any rendered file: prices, service list, opening hours,
template copy, interval values, staff names. (The 2A invariant: *facts live in
Supabase; the files only hold identity and behaviour.*)

## 6. Cron job contract (four jobs, all Supabase-driven)

Replaces the old `franel_reminders_state.json` loop. Queue = `follow_ups` table rows
(`kind`: `reminder` | `non_booker` | `check_in` | `no_show_recovery`), each with a
`due_at` computed from `clinic_config` intervals (read live per clinic, §3.1).

For each clinic, every minute:
1. Claim `WHERE clinic_id=C AND status='pending' AND due_at <= now()` (UPDATE … WHERE
   status='pending' to claim, guarding double-fire across restarts).
2. **Re-check state** (existing runbook rule, now from Supabase):
   - reminder: appointment still `confirmed` + not cancelled → else
     `status='skipped', skip_reason='appointment_cancelled'`.
   - non_booker: patient still has no `confirmed` appointment AND no recent
     booking-intent message → else skip `'now_booked'`.
   - check_in: appointment `attended` (or attendance unknown past
     `checkin_hours_after`) AND patient hasn't messaged since → else skip.
   - no_show_recovery: appointment is `no-show` AND not yet re-booked → else skip.
3. Send via §7 (template for out-of-window, which applies to **all four** — they are
   agent-initiated; in-window free-form is allowed but not default).
4. Record `usage_events` + update the `follow_ups` row (`sent_at`, wamid in `metadata`).

Idempotency: a `follow_ups` row is sent at most once (status is a one-way machine
`pending → sent|skipped`). A crashed mid-send row stays `pending` → next claim retries;
the gateway's `wamid` dedupe (plus the 24 h window check) prevents double patient
pings in the rare double-fire.

## 7. Outbound sending contract (gateway tools)

The agent has exactly two send tools (both to `GATEWAY_URL`, loopback-only):

```
POST /send          { "clinic_id": C, "to": "<E.164>", "text": "..." }
  200 → wamid                       (free-form; only if 24 h window open)
  422 { "error": "window_closed" }  (patient has not messaged in 24 h)

POST /send-template { "clinic_id": C, "to": E.164, "template_name": N,
                      "language": "en",
                      "components": [ { "type": "body",
                        "parameters": [ {"type":"text","text":...}, ... ] } ] }
  200 → wamid
  422 { "error": "template_not_approved" }
```

Agent policy:
- Inbound conversation turn → `/send`. If 422 `window_closed` (rare mid-conversation —
  only if the turn is delayed), fall back to the closest approved template or mark the
  message `metadata.wa_status='queued_window'` and let the next patient message resume
  the dialog.
- Cron (all four) → `/send-template` with the clinic's own wording:
  `template_name` = Franel name (e.g. `franel_reminder`), `components` = the
  `whatsapp_templates[kind]` text from §3.1 with `{{1}}/{{2}}` parameters filled from
  live patient/appointment data.
- On any 422/circuit-open: record `usage_events kind='wa_template_failed'` (or
  `wa_freeform_sent` with `metadata.error`), set `follow_ups.status='skipped',
  skip_reason=<error>`, and **never** retry a send that Meta rejected on policy —
  surface it to staff via an `escalations` tier-1 row if it recurs 3× for a clinic.
- Text > 1024 chars: the agent writes it; the gateway splits (agent is unaware of the
  cap). One logical message per action — the gateway's split is a transport detail.

## 8. Unit lifecycle (Franel deploy script responsibilities, Hermes = target)

```
franel-agent-<uuid>.service
  User=franel            # dedicated VPS user, not root; owns ~/.hermes/clinics/<uuid>
  ExecStart=<hermes-home>/run-agent.sh <clinic-uuid>
      run-agent.sh: cd hermes-agent; venv/bin/python -m hermes.run \
          --franel-clinic=<uuid> --config-dir=../clinics/<uuid>
  Restart=on-failure
  WantedBy=default.target
```

Hermes-side code changes implied by this contract (hermes-agent repo):
1. `--franel-clinic` mode: config from `clinic.env` + shared env (no `~/.hermes`
   globals); state root = `clinics/<uuid>/data`.
2. Replace `state.db` ingest with the §3.2 Supabase read path (a
   `franel_store.py` module is the natural seam — same shape the old SQLite reader had).
3. Replace the WhatsApp bridge tool with the §7 gateway HTTP tools.
4. Replace the reminders-state JSON loop with the §6 `follow_ups` cron.
5. STT pipeline unchanged (voice note → transcript string → same consumer).
6. Heartbeat (§4) + `--once --dry-run` parity (`hermes run --franel-clinic=<uuid>
   --dry-run`: reads + logs intended sends, `--print`-style, for acceptance testing).

Acceptance (runnable per clinic, mirrors the existing `--once --dry-run` culture):

```
venv/bin/python -m hermes.run --franel-clinic=<uuid> --dry-run
  → prints: profile loaded (settings_version N), due follow-ups found,
    intended sends (template + params), intended state writes; touches nothing.
```

## 9. Failure-mode table (who notices, what happens)

| Failure | Detection | Behaviour |
|---|---|---|
| Gateway down | send tools 5xx/timeout | agent marks message `queued` in `follow_ups`/metadata; retries next ticker; **no patient-visible gap** (ops worker drains the same queue for staff sends — patient sends also queue via the gateway's loopback-out persistence; see plan §4.1 `usage_events`/queue note) |
| Supabase brief 5xx on read | per query | backoff 1 s → 5 s; a failed live-state read fails **closed** (agent replies "let me check that for you" and holds the booking action) — never books on stale data |
| Template not approved | 422 | §7 policy (skip + meter + 3× → escalation) |
| Agent crash | systemd `Restart=on-failure` | unit auto-restarts ≤ 10 s; `follow_ups` claim guard prevents double-send |
| Clinic suspended (`clinics.status='suspended'`) | agent checks `settings_version`-row read each ticker | agent idles (inbound still logged by gateway, replies from staff only); cron claims nothing |

## 10. Boundary restated (what changes where)

| Artifact | Owner | Repo |
|---|---|---|
| `docs/hermes-runner-contract.md` | Franel | this one |
| `SKILL.md` render + `clinic.env` + unit install | Franel deploy script | this one |
| Supabase schema (incl. `settings_version` trigger, `follow_ups` semantics) | Franel | this one |
| Gateway HTTP API (§7 surface) | Franel | this one |
| `--franel-clinic` mode, `franel_store.py`, gateway tools, `follow_ups` cron, STT reuse | Hermes | hermes-agent (out of scope here) |

Anything in §9 that says "see plan §…" resolves against
`docs/franel-platform-plan.md`. If Hermes implementation needs to deviate (e.g. a
different queue primitive than `follow_ups`), the deviation is a contract change:
update this file first, both sides re-confirm, *implement* second.