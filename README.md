# Franel — Dental Clinic Patient-Conversion AI Agent

Franel is a patient-conversion AI agent for private dental clinics. It lives on the clinic's
WhatsApp number: it answers enquiries, qualifies leads, checks real calendar availability, books
appointments, sends reminders and follow-ups, and escalates to human staff when needed. Clinic
teams get a real-time dashboard to watch and steer everything.

Built by Group 18 — Frank Owusu Ansah & Nelson M.K. Ador
(Codetrain AI Talent Accelerator 2026, Healthcare & Health Access challenge).

- **Live dashboard:** https://franel-dental.vercel.app
- **Repository:** https://github.com/neltarget/franel-dental

## Architecture

| Layer | Technology | Role |
| --- | --- | --- |
| Patient channel | WhatsApp (Baileys bridge) | Patients message the clinic number; that thread is Franel |
| AI agent | Hermes Agent (LLM + tools + cron) | The patient-conversion front desk: conversation, booking, escalation |
| Scheduling | Google Calendar API | Real availability checks + appointment events |
| Platform | Supabase | PostgreSQL database, staff authentication, real-time updates |
| Sync bridge | `franel-sync` daemon (Python, VPS) | Mirrors WhatsApp/chats/Calendar into Supabase; pushes dashboard bookings, cancels and staff replies back out |
| Staff interface | React 19 + Vite + Tailwind CSS | Live dashboard (messages, bookings, patients, escalations, settings) |

- The agent's prompts are split across a stable identity file (`SOUL.md`) and clinic-aware
  operating rules (`SKILL.md`).
- All data is scoped by `clinic_id` — the schema is multi-tenant from day one.
- Hermes cron jobs (reminders, non-booker follow-ups, post-visit check-ins, no-show recovery)
  re-check patient state before sending anything.

## Repository layout

```
franel-dental/
├── README.md                # This file
├── sync/                    # VPS sync daemon (Python, stdlib only)
│   ├── franel_sync.py       # the daemon
│   ├── franel-deploy.sh     # VPS installer (env file + systemd user unit)
│   └── franel-sync.service  # systemd user unit template
└── dashboard/               # Staff dashboard (React 19 + Vite + Tailwind 4)
    ├── src/
    │   ├── pages/           # Login, Dashboard, Conversations, ConversationDetail,
    │   │                 # Appointments, Escalations, Patients, PatientDetail, Settings
    │   ├── components/    # layout (Layout context, Sidebar, Topbar, AiActivityDrawer) + ui primitives
    │   ├── hooks/         # useAuth, useData (real-time channels), useDashboardStats
    │   ├── lib/           # supabase client, types, actions (writes), activity feed, format, utils
    │   ├── App.tsx        # Router + AuthProvider + protected routes
    │   └── main.tsx
    ├── supabase/
    │   └── migrations/    # 0001_rls · 0002_bridge_seam · 0003_seed_harbourview
    ├── vercel.json        # SPA deep-link rewrite for Vercel
    ├── vite.config.ts
    └── .env               # local Supabase credentials
```

## Setup (dashboard)

Uses **yarn** as the package manager.

```bash
cd dashboard
yarn install

# create dashboard/.env with:
#   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
#   VITE_SUPABASE_ANON_KEY=<publishable key>

yarn dev        # local development (Vite)
yarn build      # production build
yarn preview    # preview the production build
```

## Configuration

| Setting | Where | Controls |
| --- | --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `dashboard/.env` (Vercel env in production) | Data + auth + real-time connection |
| Clinic profile & opening hours | Dashboard → Settings → Profile | Shown in booking confirmations; bounds offered slots |
| Service menu & pricing | `clinics` table | The agent's answer base (never invented) |
| Follow-up intervals, reminder lead time, check-in timing, no-show flag timeout | Dashboard → Settings → Automation | Per-clinic cron behaviour |
| WhatsApp message templates | Dashboard → Settings → Automation | Custom text for reminders, non-booker follow-ups, check-ins, no-show recovery |
| Team & roles | Dashboard → Settings → Team | Who can sign in (owner / manager / receptionist) and who receives escalations |

## Database

Supabase (PostgreSQL), nine tables, all scoped by `clinic_id`:

`clinics` · `staff` (linked via `auth_user_id`) · `patients` · `conversations`
(status: new / qualified / booked / escalated / closed; lead level; intent; service interest) ·
`messages` (sender: patient / franel / staff; type: text / voice / image / system) ·
`appointments` (status + attendance; two-way — mirror of Google Calendar,
and dashboard-created bookings are claimed by the sync daemon into Calendar events) ·
`escalations` (tier 1–3) · `follow_ups` (non-booker / reminder / no-show-recovery) ·
`clinic_config` (automation settings + templates).

The dashboard subscribes to `postgres_changes` on every table, so all screens update in real time.

## Agent-side runbook summary

- Always-on host runs the Hermes agent (LLM, prompts, cron scheduler).
- Baileys bridge pairs the agent to the clinic's WhatsApp number; voice notes are transcribed
  (STT) before the LLM processes them; images are received and acknowledged (not clinically
  interpreted in the POC).
- Google Calendar is the source of truth for availability; a booking is only confirmed to the
  patient after the calendar tool succeeds.

## Sync daemon (VPS)

`sync/franel_sync.py` runs on the always-on host and keeps the dashboard honest. Two directions,
every cycle (DB every 5 s, Calendar every 60 s):

- **Host → dashboard** — WhatsApp threads from `~/.hermes/state.db` (read-only) →
  `patients` / `conversations` / `messages`; Google Calendar `DENTAL APPT …` events →
  `appointments`; no-show flags from `~/.hermes/data/franel_reminders_state.json` →
  `appointments.attendance` / `status`.
- **Dashboard → host** — dashboard bookings (no `google_event_id`) → Calendar event
  `DENTAL APPT — <name> — <service>` + WhatsApp confirmation; cancellations (with a
  `google_event_id`) → Calendar event delete; staff replies (message with `wa_message_id` NULL)
  → WhatsApp via the bridge's `POST /send`, then the message id is backfilled.

Stdlib-only Python; idempotent via patient/chat cache, conversation cache, sqlite rowid cursors
and `google_event_id` dedupe. Rows seeded or created outside the dashboard are tagged
(`metadata.source`) so the claim path never re-books them.

### Install

```bash
# Supabase SQL editor: apply dashboard/supabase/migrations/0002 + 0003
scp sync/franel_sync.py sync/franel-sync.service adorneltarget@<vps>:/tmp/
ssh adorneltarget@<vps> bash /tmp/franel-deploy.sh
```

The installer creates `~/.config/franel-sync.env` (mode 600 — Supabase URL, **service_role
key**, clinic UUID, `BRIDGE_URL=http://localhost:3000`; never commit this file), the
`franel-sync.service` **user** unit (`Restart=on-failure`, `WantedBy=default.target`), verifies
the clinic row and runs a read-only dry-run before first start.

### Operations

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)     # non-login shells only
systemctl --user status franel-sync.service
tail -f ~/franel-sync/sync.log               # rotating, capped at 5 000 lines
python3 ~/franel-sync/franel_sync.py --once --dry-run
```

`~/franel-sync/state.json` holds all cursors/caches — delete it to force a full re-mirror.

### WhatsApp bridge pairing (Baileys)

First pairing (or if the phone was re-paired / the session corrupted):

```bash
systemctl --user stop hermes-gateway.service
mv ~/.hermes/whatsapp/session ~/.hermes/whatsapp/session.bak-<date>
~/.hermes/node/bin/node ~/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js \
  --pair-only --session ~/.hermes/whatsapp/session   # scan the QR with the clinic phone
systemctl --user start hermes-gateway.service
curl -s http://localhost:3000/health                 # expect "status":"open"
```

If the log shows `Connection closed (reason: 403)` in a loop, the saved pairing has been
revoked (or Meta is temporarily blocking the number) — re-pair from scratch as above; a plain
restart does not fix it. While the bridge is down, the daemon keeps mirroring and records
outbound sends as pending; queued confirmations/replies fire on the first healthy cycle.

## Deployment

The dashboard deploys to Vercel from this repository (see https://franel-dental.vercel.app);
deep links work thanks to the SPA rewrite in `vercel.json`. Environment variables are set in the
Vercel project.