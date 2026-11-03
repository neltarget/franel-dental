# Franel as a multi-clinic platform — implementation plan

Status: **decided, ready to build** (2026-10-31).
Decisions locked: Meta Cloud API (Franel as operator) · same-deploy `/console` · ops-worker
dispatch (**1A**) · cached-policy agent reads (**2A**) · Supabase as source of truth.

Companion doc: `docs/hermes-runner-contract.md` (Hermes-side contract, out-of-repo code).

---

## 1. Goal

Franel today: one dental clinic (Harbourview, seeded in
`dashboard/supabase/migrations/0003_seed_harbourview.sql`), one WhatsApp number on the
**Baileys** WhatsApp-Web bridge, one per-clinic environment in `~/.hermes`, one
`franel-sync` daemon.

Franel target: a SaaS where any number of clinics plugs in their own WhatsApp number,
gets their own dashboard tenant, their own agent, their own bookings calendar — and one
developer console lets the operators (Frank & Nelson) create clinics, manage accounts,
watch health, peek conversations, and (later) bill for plans. No per-clinic code, ever.

## 2. Decisions (with rationale, compressed)

| # | Decision | Choice | Why / cost accepted |
|---|---|---|---|
| D1 | Patient channel | **Meta WhatsApp Business Platform (Cloud API)**, Franel-owned business app | Official, durable, multi-number in one app, no phone sessions. Price paid: WhatsApp templates required for agent-initiated messages; 24 h free-form window. |
| D2 | Business verification | **Deferred** — test/dev number now; real number → production; ORC sole-prop + verification at first *paying* clinic | A linked real number is already production (any patient can message). Verification only gates 10k+ tiers + marketing templates (unused). No fake-entity shortcuts. |
| D3 | Clinic numbers | Clinics use their **existing** WhatsApp number | Saved patient contacts survive; onboarding = one SMS verification. One-way: that number leaves the classic WhatsApp app permanently — scripted into onboarding copy. |
| D4 | Console placement | **Same Vercel deploy**, `/console/*` root, own folder + lazy-loaded | Isolation already lives in Supabase RLS; a 2nd Vercel project buys no security, only ops cost. Clean extraction later if ever needed. |
| D5 | Platform staff | New `platform_users` table + `current_user_is_platform()`; no `staff` row for operators | Operators exist outside tenancy → all clinic RLS (the `clinic_of_current_user()` pattern, `0001_rls.sql:26`) excludes them by default; surgical policies added. |
| D6 | Conversation peek | **Allowed, read-only, fully audited** (`audit_log`), consent line in onboarding, MFA on all platform seats | Acceptable PII exposure for concierge SaaS; read-only RLS prevents operator writes to patient data. |
| D7 | Ops worker scope | **1A** — dispatch lives in the ops worker (gateway = pure channel) | One debugging story, one token home (gateway only), 5 s latency matches today's feel. Accepted: worker is the egress spine → console heartbeat + redeploy-runbook. |
| D8 | Agent read pattern | **2A** — static clinic facts cached ~30–60 s (invalidated on settings write), live patient state every turn | Stable prompt tokens, no per-turn re-taxing, no turn-degrading read path. `SKILL.md` → identity-only. `settings_version` bump = refresh to ~1 s. |
| D9 | Source of truth | **Supabase** for all clinic information; agent + ops worker + dashboard + gateway all read it | Kills SKILL.md fact staleness; settings edits change behaviour next tick with zero deploys. Google Calendar stays external (2-way bridge in ops worker). |
| D10 | Hermes runner | **v1: one agent process per clinic** (systemd user unit), shared `~/.hermes` code+venv, per-clinic dirs | Boring, observable, individually restartable; scale limit ~20–40 clinics before shared-agent v2 (Hermes-internal refactor, out of this repo). |

## 3. Target topology

```
                        ┌──────────────────────────── Supabase (source of truth) ─────────────┐
                        │ clinics · staff · clinic_config · patients · conversations ·        │
                        │ messages · appointments · escalations · follow_ups ·                │
                        │ platform_users · users? (supabase auth) · plans · usage_events ·    │
                        │ audit_log · insights_chats                                          │
                        │ RLS: clinic_of_current_user() for staff; platform policies for ops  │
                        └──────▲──────────────▲──────────────▲──────────────▲─────────────────┘
                               │ real-time    │ service key  │ service key  │ service key
                        (dashboard UI,     (franel-ops)   (hermes agent) (gateway)
                         unchanged,                                                                     │
                         0004 insights)                                                        Graph API (Meta)
                               │                                                                  ▲ WhatsApp Cloud API
                        ┌──────┴─────── VPS ────────────────────────────────────────┐   │        (webhooks in,
                        │ gateway/          franel-ops (was franel_sync.py)          │   │         sends out)
                        │ webhook verify+   per clinic: cal mirror · claim ·  ◄──────┘
                        │ ingest+STT        cancel · staff-send drain (1A)
                        │ /send /send-      systemd: franel-gateway, franel-ops,
                        │ template /health  franel-agent-<clinic>…
                        │ systemd: franel-gateway |     │
                        └────────────────────────────────┴───────────────────────────────
                                                        │ every turn / cron:
                                                  reads clinic facts (2A),
                                                  writes bookings, no-shows,
                                                  escalations, usage_events
```

One-way street rules:
- **Patient ↔ WhatsApp** only via `gateway`.
- **External systems** (WhatsApp Graph API, Google Calendar) only via `gateway` / `franel-ops` — never directly from the dashboard, never from the agent (the agent writes Supabase rows; workers funnel to the outside).
- **Dashboard** talks only to Supabase (realtime out, REST in) — unchanged from today.

## 4. Component specs

### 4.1 `gateway/` (new — stdlib-only Python, mirrors `franel_sync.py` style)

WhatsApp channel + the platform's only Meta-token holder.

- **Webhook** `POST /whatsapp`: verify `X-Hub-Signature-256`
  (HMAC-SHA256 of raw body with `WA_APP_SECRET`); 200-ack in <2 s; then process.
  `GET /whatsapp`: one-time `hub.challenge` echo after `hub.verify_token` check.
- **Routing**: `event.phone_number_id → clinic_id` (lookup table seeded from
  `clinics.wa_phone_number_id`; cached in memory, refresh 60 s).
- **Inbound `messages` events**: upsert `patients` (E.164 `phone`, `wa_number` in
  `metadata`) → upsert `conversations` → insert `messages` (`sender='patient'`,
  `wa_message_id='msg-<wamid>'`, dedupe on that). **No `state.db` writes** (the agent
  reads Supabase directly — D9). Voice notes: download via Media API → STT → insert
  transcript with `metadata.media_kind='audio'` (today's Baileys STT behaviour, new pipe).
  Images: download + `message_type='image'` acknowledge-only row (POC parity).
- **`statuses` events**: backfill `messages.metadata.wa_status`
  (`sent|delivered|read|failed`) on the matching `wa_message_id`; failed status feeds
  the ops-worker retry path (1A).
- **Outbound API** (loopback/VPC only, not public):
  - `POST /send {clinic_id, to, text}` → free-form, **only** if 24 h window open
    (last patient message < 24 h); else 422 `window_closed` (caller must use template).
  - `POST /send-template {clinic_id, to, template_name, language, components}` →
    utility templates.
  - Both: log `usage_events` rows (`wa_freeform_sent` / `wa_template_sent`).
  - **Outbox resilience**: if a Graph call fails (5xx/timeout), the intended send is
    persisted to the gateway's local `outbox.json` (bounded, mode 600) and retried by
    the gateway until it lands or the clinic is suspended — callers (agent, ops worker)
    get a 202 `queued` and never block on Meta. `wamid` backfill happens at actual send
    time.
  - Text > 1024 chars → sequential split (Meta free-form cap; replaces the 4000-cut in
    `franel_sync.py:262`).
- **Onboarding pipeline API** (operator-triggered, `platform`-scoped secret):
  `POST /onboard {clinic_id, phone}` → link number (Graph `/phone_numbers`)
  → set display name (`/profile`) → create+submit the 5 utility templates
  (wording from that clinic's `clinic_config.whatsapp_templates`) → polling loop
  writing `clinics.wa_status` state machine: `pending → linked → name_pending →
  templates_pending → live` (+ `blocked` with reason).
- **`GET /health`**: token validity probe + last-webhook age + per-clinic queue depth.
- **Env** (`~/.config/franel-gateway.env`, mode 600): `WA_APP_TOKEN`, `WA_APP_SECRET`,
  `WA_VERIFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, port (3001).
- **systemd user unit** `franel-gateway.service` (pattern of `franel-sync.service`).
- Testability: `--dry-run` logs intended Graph calls; `scripts/wa_replay.py` reads a
  captured-event file → same handler (unit-test webhook shapes offline).

### 4.2 `franel-ops` (successor to `sync/franel_sync.py`; file renamed in place)

Small long-running worker. **Dies** (confirmed line ranges in today's `franel_sync.py`):
`sync_conversations` :490-595 + its helpers `ensure_patient`/`ensure_conversation`
:396-480, `message_wa_id`/`SESSION_KEY_PHONE_RE` :350, :483-487 (state.db mirror —
replaced by gateway direct-writes), `load_no_show_flags` :682-704 +
`mirror_no_shows` :707-736 (agent writes no-show status directly), single-tenant
`FRANEL_CLINIC_ID` :374.

**Lives (multi-clinified):**
- **Calendar mirror** :598-679 → per clinic: list `DENTAL APPT …` events the clinic's
  calendar (`--calendar-id` flag added to `google_api.py`, one GCP service account
  managing N calendars), insert new, *cancel-detect by diff* (event gone in Calendar →
  appointment `cancelled`, `cancelled_via='calendar_delete'`), 60 s cadence.
- **Dashboard bookings claim** :748-828 → create Calendar event on the right clinic's
  calendar; WA confirmation now via `gateway /send-template franel_booking_confirm`
  (template, since dashboard bookings may fall outside the patient's 24 h window).
- **Cancels** :830-856 → Calendar delete (unchanged).
- **Staff-send drain (1A)** :859-927 → per clinic: claim `messages(sender='staff')`
  with `wa_message_id is null`; window check (last patient msg < 24 h → free-form
  `gateway /send`, else 422 → mark `metadata.send_error='window_closed'` + surface
  "send blocked — patient hasn't messaged in 24 h, send a template nudge first" in
  dashboard); backfill `wa_message_id`; retry ≤8 then dead-letter in `metadata`
  (dead-send bookkeeping :910-927 retained); `usage_events` metered.
- **Ops frame**: multi-clinic `Ctx` (per-clinic `state.json` slice, same
  `flock` :947, per-clinic log rotation); `clinics.status in ('trial','active') and
  wa_status='live'` set re-read each cycle (console "create clinic" needs no deploy);
  **heartbeat**: upsert `clinics.ops_heartbeat_at` per cycle → console health tile
  ("last ops beat 40 s ago → red").
- Calendar credential note: `gapi_python()`/`GAPI` :36,:179-204 now take
  `--calendar-id` per clinic (first arg after subcommand).

### 4.3 Hermes agent (per-clinic runner — contract in `docs/hermes-runner-contract.md`)

- One systemd user unit per clinic: `franel-agent-<clinicshort>.service`
  (unit-per-clinic = observable, individually restartable; supervisor-ize at ~15+).
- **Reads Supabase directly (2A)** — service key (agent is platform infra; RLS stays
  the *tenant* boundary for clinic staff, not the agent):
  - *Static facts* (services+prices, opening hours, profile, template wording) →
    in-process TTL cache 30–60 s; **invalidated on write** via `clinics`/
    `clinic_config` `settings_version` bump (or `pg_notify` listen) → effective
    staleness ≈ 1 s after a dashboard save.
  - *Live state* (patient record, open conversation + recent messages, today's
    appointments, open escalations, follow-ups due) → fetched every turn (1–2
    PostgREST calls).
- `SOUL.md` stays (identity/persona, platform-level). `SKILL.md` becomes **identity
  + behaviour only** — no clinic facts (facts leave the file; rendered once at
  onboarding, re-rendered only on profile-identity changes like clinic name).
- **Writes Supabase directly**: bookings → `appointments`
  (`metadata.source='agent'`, no `google_event_id`; the ops worker's claim funnel is
  the *only* Calendar writer), no-shows → `appointments.status='no-show'` directly
  (kills the JSON-file mirror), escalations, conversation status transitions,
  `usage_events` (`llm_call` per LLM turn → future metering/pricing input).
- **Outbound messages** never call Meta directly: template automations
  (reminders, non-booker follow-ups, check-ins, no-show recovery) and any
  out-of-window agent message → `gateway /send-template`; in-window conversation
  replies → `gateway /send`. Every outbound lands in `messages`
  (`sender='franel'`) so the dashboard realtime feed is complete.
- Cron jobs (existing four: reminders, non-booker, check-in, no-show recovery) keep
  re-checking patient state before sending (current behaviour) — now reading Supabase
  live instead of `~/.hermes/data/franel_reminders_state.json` (that file dies);
  per-clinic cadence from `clinic_config` (intervals already live there — a dashboard
  edit changes the next tick, zero deploy).

### 4.4 Schema — migration `0005_platform.sql`

```
platform_users        (id uuid pk, auth_user_id uuid unique -> auth.users,
                       email text, is_active bool default true, created_at)
plans                 (id uuid pk, name text unique, price_ghs numeric,
                       limits jsonb /* max_staff, template_msgs_per_mo, llm_msgs_per_mo */)
clinics+:             wa_phone_number_id text, wa_number text,
wa_status text default 'pending'
                        /* pending|linking|active|error — implemented state machine (0005);
                           sub-steps (display name, 5 templates) tracked inside
                           wa_templates_status jsonb + wa_display_name */,
                       wa_display_name text, wa_templates_status jsonb,
                       calendar_id text, plan_id uuid -> plans,
                       status text default 'trial'
                       /* trial|active|suspended|churned */,
                       renews_at timestamptz, settings_version int default 0,
                       ops_heartbeat_at timestamptz, onboarded_at timestamptz
usage_events          (id bigserial pk, clinic_id uuid, kind text
                       /* wa_freeform_sent|wa_template_sent|wa_template_failed|llm_call */,
                       ref_id uuid nullable, ts timestamptz default now())
                       -- partial index (clinic_id, kind, ts DESC)
audit_log             (id bigserial pk, actor_auth_user_id uuid, actor_name text,
                       clinic_id uuid nullable, action text, target text,
                       before jsonb, after jsonb, ip text, ts timestamptz)
```

RLS (additions only; existing clinic policies untouched):
- `platform_users`: read+write for platform users (`current_user_is_platform()`);
  anon reads nothing.
- `plans`: read for platform + own-clinic (clinic sees its plan name/limits); writes platform-only.
- `clinics`: platform gets SELECT/UPDATE on all clinics (operational cols;
  service-menu/branding stays clinic-editable too; both allowed).
  `clinic_config`: platform read-all (peek source + onboarding template source),
  clinic write-own (existing) + platform write (onboarding/config fixes).
- **Conversation peek (D6)**: platform SELECT-only on `patients`, `conversations`,
  `messages`, `appointments`, `escalations` (messages joined through
  `conversations.clinic_id`, same pattern as `0001_rls.sql:117-141`). No
  insert/update policies for platform → structurally read-only.
- Helper `public.current_user_is_platform()` (`SECURITY DEFINER`): true iff an active
  `platform_users` row exists for `auth.uid()`.
- Trigger: `UPDATE clinics SET settings_version = settings_version + 1` on any UPDATE to
  `clinic_config` (or the owned `clinics` row) — the 2A invalidation signal.
- `usage_events` / `audit_log`: platform read-all; writes only via service key
  (gateway / ops / console service functions) — never from the anon key.

### 4.5 Developer console (`dashboard/src/console/` — new, lazy-loaded)

- **Routes** (`App.tsx`): `/console` root renders its own `<ConsoleLayout>` (own sidebar,
  never the clinic `Layout`). Route-level `React.lazy` → separate JS chunk, so clinic
  staff never download console code. Render guard: session user ∈ `platform_users`
  (`usePlatformSession` hook, mirrors `useAuth`); clinic users hitting `/console` are
  bounced to `/`. Login stays the shared `/login` (platform seats sign in on the same
  page; MFA enforced on platform users).
- **Screens**:
  - `/console` **Overview** — per-clinic tiles (name, `status`, `wa_status`, 24 h message
    count, ops heartbeat age), platform KPIs (patients/appointments/escalations this
    week), alert band (ops heartbeat stale > 120 s, template stuck pending, dead-letter
    sends > 0).
  - `/console/clinics` **list + Create clinic** (D: no-code onboarding) — 4-step wizard:
    1. Profile (name, address, contact, opening hours) → 2. Services & pricing (same JSON
    shape as the seeded `clinics.services`) → 3. Team (owner name/email + roles for staff)
    → 4. WhatsApp (enter number + the one-way-app-switching consent copy, [Start
    onboarding]).
    The wizard's server-side half is a **new Edge Function `create-clinic`**
    (service-key scope: creates `clinics` + default `clinic_config`, the owner's Supabase
    auth user via Admin API, `staff` row, per-clinic Google Calendar in the Franel GCP
    project (store `calendar_id`), then triggers `gateway /onboard`). Temp owner
    credentials shown in-console (email-provider wiring is a listed follow-up, not
    blocking).
  - `/console/clinics/:id` tabs:
    - **Profile & automation** — edit profile/hours/services/template texts (same forms
      as the clinic `SettingsPage`, platform RLS); each save bumps `settings_version`
      (trigger) → agent sees it ≤ 1 s (2A).
    - **Team** — roster, add (email+role), deactivate, password reset (Admin API).
    - **WhatsApp** — `wa_status` machine + per-step retry (re-invokes that pipeline step),
      5-template approval grid (name/category/status), display name, number, messaging-limit tier.
    - **Health** — sends (freeform/template/failed), delivery/read rates, LLM calls and
      est. cost from `usage_events`; ops heartbeat; agent activity (messages/hr); no-show trend.
    - **Conversations (peek)** — read-only; reuses `ConversationDetail` with a `readOnly`
      prop (disable composer); opening one logs `audit_log`.
    - **Billing (stage-1 stub)** — plan assign, `renews_at`, usage-vs-limits bars,
      **Suspend/Reactivate** → `clinics.status='suspended'`: ops worker stops all
      outbound for that clinic (keeps mirroring calendar), gateway keeps receiving but
      answers with a `suspended` system note in Supabase (clinics tab shows the flag).
  - `/console/audit` — `audit_log` table with clinic/actor/action filters.
- **Reuse, don't duplicate**: every console table/form is an existing `ui/` primitive or
  a `SettingsPage` form extracted into `src/components/forms/` (both consumers) — keeps
  the "two copies of a form" drift risk at zero.

### 4.6 What dies (explicit kill list)

- Baileys bridge + `~/.hermes/whatsapp/session` (post-cutover; session folder kept 1 week).
- `~/.hermes/state.db` **as a data store** (gateway writes Supabase directly; the file
  may remain as the Hermes-internal agent log if Hermes wants it — no Franel code reads
  it anymore).
- `~/.hermes/data/franel_reminders_state.json` (agent writes no-show status directly).
- `franel_sync.py` readers: `sync_conversations` (:490-595), `load_no_show_flags`
  (:682-704), `mirror_no_shows` (:707-736), `ensure_patient`/`ensure_conversation`
  (:396-480) as public API (subsumed by `gapi`/ops plumbing), `message_wa_id`/
  `SESSION_KEY_PHONE_RE` (:350, :483-487), single `FRANEL_CLINIC_ID` env (:374).
- `BRIDGE_URL` env → `GATEWAY_URL`. `franel-deploy.sh` rewrites → `franel-ops` +
  `franel-gateway` install (2 user units + the per-clinic agent units).
- 4000-char send truncation (:262) → 1024 sequential split in gateway.

## 5. Phases (each independently shippable)

| Phase | Scope | Repo changes | Exit criteria |
|---|---|---|---|
| **0 — Meta bring-up + gateway skeleton** | Meta dev account, Business app, WhatsApp product, **real number linked** (logged out of classic WA first), webhook URL pointed at VPS (Caddy HTTPS in front of gateway), 3–5 testers messaging freely as patients + staff logins in a **sandbox clinic** | `gateway/` (webhook, routing, /send, /send-template, /health, `--dry-run`, `wa_replay.py`); `franel-gateway.service`; Caddyfile note in runbook | Testers book an appointment end-to-end via the real number; message rows land in Supabase; a free-form reply goes back; `statuses` backfill visible |
| **1 — Schema + platform role** | Migration `0005`; `create-clinic` Edge Function; `usePlatformSession` + `/console` guard + Overview screen (read-only tiles from live data) | `0005_platform.sql`, `functions/create-clinic/`, `src/console/{ConsoleLayout,Overview}`, `App.tsx` routes, `lib/types.ts` | A platform account exists, sees all clinics + KPIs, cannot touch patient writes |
| **2 — Console control station** | Create-clinic wizard (incl. Calendar provisioning + `/onboard` trigger), Team tab, Profile & automation, WhatsApp tab (state machine + retries), peek + `audit_log` wiring, Staff/Settings form extraction | `src/console/**` full tab set, `functions/create-clinic` completion, `SettingsPage` form extraction, `useData` additions | A brand-new clinic is created with zero code: number live, templates approved, first patient conversation works, owner can log in |
| **3 — Ops worker cutover** | `franel_sync.py → franel-ops` multi-clinic rewrite (1A dispatch, per-clinic calendar, heartbeat); `google_api.py --calendar-id`; per-clinic agent units + SKILL.md identity-only re-render; kill list executed; cutover runbook | `sync/franel_ops.py` (+deploy), `google_api.py` flag, `docs/hermes-runner-contract.md` (done), runbook md | Old `franel-sync` unit stopped, both the sandbox clinic and Harbourview run on the new stack, zero lost messages across the flip |
| **4 — Production + verification milestone** | Harbourview (or first paying clinic) on its number; ORC sole-prop registration → Meta business verification; pricing table populated | Docs/runbook updates only | Real clinic live; verification filed; template sends 100% (if Phase 0's template-send check came back blocked pre-verification, this is when they unblock) |

## 6. Onboarding pipeline (what "create clinic, no code" executes)

```
console wizard (4 steps)
  → create-clinic Edge Function (service key):
      clinics row (+calendar_id from new Calendar) · clinic_config defaults ·
      owner auth user + staff row · temp creds displayed
  → gateway /onboard:
      link number → display name → 5 templates (clinic's own wording) → opt-in poll
      (wa_status: pending → linked → name_pending → templates_pending → live)
  → franel-ops auto-adopts clinic next 5 s (status live)
  → agent unit installed + started (per hermes-runner-contract.md)
  → owner temp creds → dashboard live
Timeline: same-day for number+agent; display name ~24 h (cosmetic, non-blocking);
          templates usually < 24 h (utility category).
```

## 7. Meta bring-up checklist (external, non-code — Phase 0)

1. `developers.facebook.com` → create **Business** app (name "Franel" — matches the
   eventually verified business; product: **WhatsApp**).
2. Business Manager: attach the app. (No verification yet — dev/production-by-number.)
3. WhatsApp API setup: **link your real number**. Pre-condition: that number is logged
   out of the classic WhatsApp/WhatsApp Business app on its phone (**one-way**).
4. Create a **System User** → permanent access token with
   `whatsapp_business_messaging` + `whatsapp_business_management`. Store in
   `~/.config/franel-gateway.env` (mode 600). Never in the repo, never in Vercel env.
5. Capture `PHONE_NUMBER_ID`, `APP_ID`/`APP_SECRET`, choose `VERIFY_TOKEN`.
6. Webhook: subscribe to `messages`, `statuses`, `template_status_update` at
   `https://<vps-domain>/whatsapp` (Caddy reverse proxy → `localhost:3001`).
7. **Bring-up verification (the two known unknowns)**:
   a. can a *template* be created + sent on a production-but-unverified number?
      (free-form is certain.) If blocked → console shows templates `pending_meta`;
      unblocks at Phase 4 verification.
   b. is the per-number **display name** settable pre-verification? (API or
      Business Manager portal; ~24 h propagation.)
8. Register 3–5 test phones as staff in the sandbox clinic; testers message the number
   as patients. (No Meta "test users" registration needed — a linked real number is open.)

## 8. Cost & limits posture

- WhatsApp: free service (patient-initiated) conversations; utility templates per-message
  (Ghana = low tier — verify current rate card); **no marketing templates anywhere in the
  product** (would need verification + opt-in; not in the model).
- Message limits: per-number tier 1k/day → auto-scales; two clinics on one VPS ≪ the
  platform ceiling.
- LLM: metered per `usage_events.llm_call`; plan `limits.llm_msgs_per_mo` enforced by
  the agent runner (degrades to a queued "we'll get back" reply, not silence).
- VPS: gateway + ops + N agent units ≈ N × (agent RSS). ~20–40 clinics before VPS-2 or
  the shared-agent v2 refactor (Hermes-internal, out of scope).

## 9. Out of scope (explicit, with the phase where each becomes in)

- Self-serve public signup (Phase 5+, after verification + billing).
- Real payment processing (Phase 4/5; `plans`/`usage_events` shape is the plug point).
- Per-clinic data export (Phase 5).
- Shared-agent v2 (Hermes refactor when per-clinic units stop fitting one VPS).
- Marketing templates / cold outreach (product decision, indefinitely).
- Image "clinical interpretation" (POC parity: receive + acknowledge, as today).

## 10. Open items (answers needed, none blocking Phase 0 start)

1. **Sandbox vs Harbourview as clinic #1**: Phase 0 testing recommended in a
   **sandbox clinic** (fresh, disposable rows) so test noise never mixes into Harbourview
   data; Harbourview goes live in Phase 4. (One extra "create clinic" click later.)
2. **Google Calendar**: fresh per-clinic calendar created by `create-clinic` in the
   Franel GCP project (recommended — clean audit, no personal-calendar sharing dance) vs
   letting a clinic share an existing calendar with the service account (supported by the
   same `calendar_id` column either way).
3. **Testers' split**: 3–5 people across both roles (some patients-only, some
   patient+staff) — confirm who holds which so staff rows + roles are provisioned right.
4. **Temp-credential delivery**: in-console display only (MVP) vs wire an email provider
   (e.g. Resend) in `create-clinic` — pick before Phase 2 build of the wizard completes.
5. **VPS HTTPS domain**: does one exist for `<vps-domain>/whatsapp`, or add Caddy + a
   domain now (Phase 0 needs it for the webhook).

## 11. Decision log (this planning session)

- Baileys → Meta Cloud API (platform, not partner BSP; Franel is the operator).
- Real number = production; business verification deferred to first paying clinic
  (ORC sole-prop under the founder's name is the intended entity — never a workaround).
- Clinics keep their existing numbers (one-way app switch scripted into onboarding).
- Console in the same deploy at `/console`, lazy-loaded, RLS-gated (no 2nd Vercel
  project).
- Peek = read-only + audited + consent line + MFA platform seats.
- **1A** dispatch in ops worker (one token home = gateway; 5 s latency accepted;
  worker heartbeat surfaced in console).
- **2A** agent reads: static facts TTL-cached 30–60 s + write-invalidation
  (`settings_version`); live patient state every turn; `SKILL.md` identity-only.
- Supabase = source of truth; workers are the only external-system edge; `state.db` and
  the reminders-state JSON die; no-shows written directly by the agent cron.