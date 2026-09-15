-- ============================================================================
-- Franel Dental · 0002 — Sync-daemon seams (run AFTER 0001)
-- ============================================================================
--
-- The franel-sync daemon (Python, on the VPS, next to the Hermes agent) talks
-- to Supabase exclusively over PostgREST with the **service_role key**:
--   • reads  → GET /rest/v1/... (RLS is bypassed; the client is "postgres")
--   • writes → POST/PATCH upserts (the same PostgREST API the dashboard uses)
-- No logical replication, no raw PG socket, no direct Realtime socket needed:
-- the daemon polls (<=5s) and every write is idempotent, so a missed poll can
-- never duplicate a row — the three columns below are the idempotency seams.
--
-- SECURITY:
--   • The service_role key = "trusted server only". Keep it ONLY in
--     /home/adorneltarget/.config/franel-sync.env on the VPS (chmod 600).
--   • NEVER commit it to this repo. NEVER ship it to the browser.
--   • Rotate if leaked: Supabase → Project Settings → API → Regenerate secret.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) messages.wa_message_id — inbound/outbound WhatsApp message id.
--    One unique logical message per row, regardless of how many times the
--    daemon polls or redelivers.
-- ----------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS wa_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS messages_wa_message_id_key
  ON public.messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2) patients.wa_chat_id — the patient's WhatsApp identity, e.g.
--    '2332401234567@c.us' or '123456789@s.whatsapp.net' or '<digits>@lid'.
--    The daemon upserts patients on this column: a conversation's session
--    chat_id maps 1:1 to one patient per clinic.
-- ----------------------------------------------------------------------------
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS wa_chat_id text;

CREATE UNIQUE INDEX IF NOT EXISTS patients_wa_chat_id_key
  ON public.patients (wa_chat_id)
  WHERE wa_chat_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3) appointments.metadata — jsonb sidecar for the dual-write.
--    Keys used by the daemon:
--      google_event_id : string  — the Google Calendar event id the appointment
--                                   was created from (or to). Dedupe key.
--      source          : 'dashboard' | 'whatsapp' | 'manual'
--      no_show         : bool    — mirrored from the reminder engine state
--      synced_at       : string(timestamptz)
--    New dashboard bookings default to {} → the daemon claims them
--    (metadata.source='dashboard' and no google_event_id) and creates the
--    calendar event, then writes google_event_id back.
-- ----------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

-- daemon hot-path: find unclaimed dashboard bookings
CREATE INDEX IF NOT EXISTS appointments_unclaimed_board
  ON public.appointments (created_at)
  WHERE (metadata->>'source' IS NULL OR metadata->>'source' = 'dashboard')
    AND metadata->>'google_event_id' IS NULL;

-- daemon mirror: find local rows by calendar event id (change-detection / cancel)
CREATE INDEX IF NOT EXISTS appointments_google_event_id_idx
  ON public.appointments ((metadata->>'google_event_id'))
  WHERE metadata->>'google_event_id' IS NOT NULL;