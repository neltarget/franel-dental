# Franel — kill the WhatsApp (Baileys) path, keep everything else

## Goal
Remove every code path in this repo that **sends to or reads from WhatsApp via the Baileys bridge / hermes state**, so no message can leave the repo toward WhatsApp (Meta Cloud absent → account-suspension risk). Calendar, no-shows, dashboard, demo mode, Supabase data and schema: untouched. No WhatsApp/Meta API calls made during the work.

## What I checked
- `grep -ri bailey|bridge|whatsapp` across repo (excl. node_modules): bridge code lives ONLY in `sync/franel_sync.py` + `franel-deploy.sh` + README/docs. `gateway/` is the future Cloud API (no Baileys, no live Meta traffic), `dashboard` never calls WhatsApp directly.
- The real clinic WhatsApp line number (233-50-…) appears in: `dashboard/supabase/migrations/0003_seed_harbourview.sql` (clinic + staff phone) and `docs/build-order.md` (Phase 0 row). Both scrubbed; live `clinics.phone` nulled. Demo/placeholder numbers (fake digits in `demo/seed.ts`, `wa_replay.py`, `gateway.py`) are not the real line — left as-is.
- `git status` clean; production Supabase project known from memory (`qsqlipuyosgdzyphcfts`).

## Changes

### 1. `sync/franel_sync.py` — strip the WhatsApp path (core)
- Delete `bridge_req()`, `bridge_send()` (the only code that POSTs to the Baileys bridge `/send`) and `Ctx.bridge_url`.
- Delete `sync_conversations()` (mirrors `~/.hermes/state.db` WhatsApp DMs → Supabase `patients`/`conversations`/`messages`) + helpers `ensure_patient()`, `ensure_conversation()`, `message_wa_id()`, `chat_to_phone()`, `session_key_phone()`, and `DEFAULT_STATE` keys `patient_by_chat` / `conv_by_patient` / `msg_cursor` / `dead_send`.
- `send_staff_messages()` (drains staff replies → bridge `/send`): delete the function and its call in `cycle()`. Staff reply rows stay in Supabase untouched (they simply stop being drained).
- `claim_dashboard_appointments()`: keep calendar create + metadata + status flow; remove the `bridge_req /send` confirmation block and drop the `patients(wa_chat_id)` select; keep writing `WhatsApp: <chat>` into the Calendar description only when known (harmless, keeps round-trip parity).
- Keep intact: `sync_calendar()`, `mirror_no_shows()`, `sync_dashboard_cancels()`, all state-file handling, logging, env loading.
- Update module docstring to reflect the new (WhatsApp-free) contract.

### 2. `sync/franel-deploy.sh`
- Remove `BRIDGE_URL` line from the env template.

### 3. `README.md`
- Delete the "WhatsApp bridge pairing (Baileys)" section; rewrite "Agent-side runbook summary" and the sync-daemon section to describe the current WhatsApp-free behaviour.

### 4. `docs/build-order.md`
- Redact the real number on the Phase 0 row; note BAILEYS PATH REMOVED in current state.

### 5. `dashboard/supabase/migrations/0003_seed_harbourview.sql`
- Real number → `NULL` (clinic.phone, staff.phone) so the number leaves the repo. No DB write — the file is historical seed; the live DB row only changes if Target re-runs it (his call).

## Explicitly NOT touched (confirmed safe)
- `gateway/`, `scripts/wa_replay.py` — Cloud API targets, no Baileys, no Meta calls in this work.
- `dashboard/` src incl. demo mode — no WhatsApp I/O; usable as a demo exactly as-is.
- Supabase schema (`wa_*` columns) and all existing dashboard rows.
- VPS side (not in this repo, flagging only): stop/disabling `hermes-gateway.service` = the kill switch for the live Baileys session. Recommend Target runs on the VPS: `systemctl --user disable --now hermes-gateway.service`; and disable or reinstall `franel-sync.service` with the updated file. Runbook provided, not executed by me.

## Verification (no WhatsApp involved)
1. `python3 -m py_compile sync/franel_sync.py` — green.
2. Grep: no lingering `bridge|baileys` refs in sync/README/deploy.
3. Grep: real number gone from the repo.
4. `cd dashboard; yarn build` + `yarn lint` — dashboard unchanged, must stay green (sanity).
5. Optional read-only: `python3 sync/franel_sync.py --once --dry-run` (Supabase GET + calendar read only) if a service key is available locally.

## Open question (answer before executing)
0003 is an applied migration (its `ON CONFLICT DO NOTHING` means re-running would NOT clear the live number). Should I additionally run a **live UPDATE** on Supabase setting `clinics.phone`/`staff.phone` to NULL, or leave the live DB as-is and only scrub the repo file? (My suggestion: also scrub live — the number is the thing at risk.)