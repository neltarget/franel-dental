# Franel platform build — order of operations

How the multi-clinic platform build comes together: the work packages, where each
piece runs, what's open, and the current state of the live system.
Updated as work lands; **Status** column is the single source of progress truth.

| # | Work package | Status | Runs on | Unblocks |
|---|---|---|---|---|
| 1 | `0005_platform.sql` + `types.ts` | **DONE 2026-11-03** (applied to `qsqlipuyosgdzyphcfts`) — verify RLS in a browser with a platform account once package #5 lands | Supabase (remote) | everything below |
| 2 | Phase 0 — Meta bring-up (external) | **OPEN — needs Target**: Business app + WhatsApp product, link the clinic's WhatsApp number (one-way: log that number out of the classic WA app on the phone first), System User token, webhook at `https://<vps-domain>/whatsapp`, Caddy on the VPS, `~/.config/franel-gateway.env`, 3–5 tester phones | Meta dashboard + VPS | gateway |
| 3 | `gateway/` (webhook, `/send`, `/send-template`, `/onboard`, `/health`, outbox, `franel-gateway.service`, `scripts/wa_replay.py`) | **DONE 2026-11-03** — compiles clean; 5-sample-event offline replay green (text/audio/image/status-read/template-status); live dry-run HTTP smoke: `/health`, webhook GET verify (200+challenge / 403 wrong token), signed POST (200 / 401 bad sig), `/send` Bearer (200 / 401); outbox enqueue+drain verified | VPS (`franel-gateway` systemd user unit, port 3001) | ops worker; clinic cutover |
| 4 | Supabase Edge Function `create-clinic` (service key: clinic + config + owner auth user + staff row + Google Calendar, then pings gateway `/onboard`) | PENDING | Supabase Edge Functions | console wizard |
| 5 | Console: migration-gated scaffolding (lazy `/console` routes, `ConsoleLayout`, `WaStatusBadge`, Overview read-only tiles from live data) | **DONE 2026-11-03** — lazy chunk verified in build output (`ConsoleRoot/Overview/ClinicsPage/AuditPage` separate from clinic `index`); `usePlatformSession` + `PlatformProtectedRoute` (RLS-gated `platform_users` lookup); Overview KPIs + per-clinic tiles + alert band (stale heartbeat >120 s, WA error, dead letters); Clinics table; Audit log w/ filters. **Manual step when first operator signs in**: create the 2 platform accounts (Supabase Auth users + `platform_users` rows) — no SQL for it on purpose (passwords) | dashboard (Vercel, same deploy) | control station |
| 6 | Console: control station (wizard 4 steps reusing extracted Settings forms, Team/Profile/WA/Health/Conversations tabs, peek + `audit_log` writes, Suspend, `usePlatformSession`) | PENDING | dashboard | no-code onboarding |
| 7 | `sync/franel_ops.py` (multi-clinic: per-clinic calendar, claim funnel → gateway template sends, cancels, staff-drain 1A, heartbeat) + `franel-deploy.sh` rewrite (gateway + ops + per-clinic agent units) | PENDING | VPS | cutover |
| 8 | Hermes-side (hermes-agent repo, out of this repo): per-clinic runner mode (`--franel-clinic=<uuid>`), Supabase-backed store (`franel_store.py`) per `docs/hermes-runner-contract.md` §3–4, gateway send tools, `follow_ups` cron replacing `franel_reminders_state.json`, identity-only `SKILL.md` render | PENDING (contract signed) | VPS (`franel-agent-<uuid>` units) | live agent per clinic |
| 9 | Cutover: HarbourView → Cloud API via console (link number, templates), sandbox clinic for tester chaos, stop `franel-sync` + bridges, runbook drill | PENDING | VPS + console | production |
| 10 | Phase 4: first paying clinic, ORC sole-prop → Meta business verification, `plans` populated | PENDING | Meta + console | billing |

Order dependency (critical path): **1 → 2 ∥ 4 → 3 → 9 → {6 ∥ 7 → 8} → 10**.
- 2 and 4 are independent (Meta portal work vs Edge Function code) — run in parallel.
- 3 needs 2's webhook URL live for real testing, but the code + `wa_replay.py`
  offline tests don't need Meta at all.
- 9 is the gate where both old and new stacks run before the flip (see kill list
  in `franel-platform-plan.md` §4.6).

## Where each piece runs (ops map)

| Component | Host | Identity | Secrets live in |
|---|---|---|---|
| Dashboard + console | Vercel | anonymous key + user JWTs (RLS) | Vercel env (anon key only) |
| `create-clinic` Edge Function | Supabase | service key | Supabase function secrets |
| `franel-gateway` | VPS, systemd **user** unit | user `adorneltarget` | `~/.config/franel-gateway.env` (600): `WA_APP_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PORT`, + optional voice-note STT vars |
| `franel-ops` (was `franel-sync`) | VPS, systemd user unit | `adorneltarget` | `~/.config/franel-sync.env` (add `GATEWAY_URL=http://localhost:3001` when the gateway lands) |
| Hermes agent runners | VPS, one systemd user unit per clinic | `adorneltarget` | `~/.hermes/clinics/<uuid>/clinic.env` + `~/.config/franel-shared.env` |
| Google Calendar | GCP | one Franel service account, N calendars (`--calendar-id` per clinic) | GCP (unchanged) |

## Hermes-side open questions (answer when package #8 starts; contract is signed)

1. Does hermes-agent already have a pluggable "store" seam (the `state.db`
   reader), or is the SQLite read threaded through call sites? → determines whether
   `franel_store.py` is a drop-in module or a refactor.
2. Where do the four cron jobs (reminders/non-booker/check-in/no-show-recovery)
   schedule their intervals today — config file, code constants, or the state JSON?
   (Contract says: from `clinic_config`, live read.)
3. STT pipeline location: verify it's reachable from a `--franel-clinic=<uuid>`
   mode without the Baileys session (transcript-in, no WhatsApp-in).
4. Unit template: confirm `run-agent.sh` shape (contract §8) matches how hermes
   entrypoint actually starts (module name, args, env loading).

## Current state (unchanged by WP-1)

- Live: single-clinic POC — `franel-sync` (WhatsApp/Baileys path removed 2026-11-09:
  no inbound WA mirror, no bridge sends; calendar + no-show + dashboard-claim sync only)
  + per-Hermes config.
- DB now has platform columns/tables (all NULL/default on the existing HarbourView
  row: `status='active'`, `wa_status='pending'`, `settings_version=0`), RLS platform
  policies, and the `settings_version` bump triggers. Nothing reads the new columns
  yet — zero behaviour change.
- Next smallest shippable thing: `create-clinic` Edge Function (#4) or the gateway
  skeleton + `wa_replay.py` offline tests (#3) — neither needs Meta.