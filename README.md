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
└── dashboard/               # Staff dashboard (React 19 + Vite + Tailwind 4)
    ├── src/
    │   ├── pages/           # Login, Dashboard, Conversations, ConversationDetail,
    │   │                 # Appointments, Escalations, Patients, PatientDetail, Settings
    │   ├── components/    # layout (Layout context, Sidebar, Topbar, AiActivityDrawer) + ui primitives
    │   ├── hooks/         # useAuth, useData (real-time channels), useDashboardStats
    │   ├── lib/           # supabase client, types, actions (writes), activity feed, format, utils
    │   ├── App.tsx        # Router + AuthProvider + protected routes
    │   └── main.tsx
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
`appointments` (status + attendance, mirrored from Google Calendar) ·
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

## Deployment

The dashboard deploys to Vercel from this repository (see https://franel-dental.vercel.app);
deep links work thanks to the SPA rewrite in `vercel.json`. Environment variables are set in the
Vercel project.