-- ============================================================================
-- Franel Dental · 0004 — Insights chat (owner AI assistant) thread persistence
-- ----------------------------------------------------------------------------
-- HOW TO APPLY
--   1. Open Supabase Dashboard → SQL Editor → New query.
--   2. Run 0001 first if you haven't (RLS helper public.clinic_of_current_user
--      must exist — it does if 0001–0003 were applied).
--   3. Run this file top-to-bottom.
--
-- The chat threads/messages are owned by the staff member, scoped to their
-- clinic, and RLS-gated exactly like the other tenant tables. The AI itself
-- runs in the `franel-insights` edge function and only READS clinic data via
-- the caller's own JWT (RLS-scoped) — these tables store the conversation
-- artifact so threads survive device changes and are visible per-staff.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_chats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'New chat',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insights_chats_staff_idx
  ON public.insights_chats (staff_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.insights_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     uuid NOT NULL REFERENCES public.insights_chats(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insights_chat_messages_chat_idx
  ON public.insights_chat_messages (chat_id, created_at);

-- ----------------------------------------------------------------------------
-- RLS — same pattern as 0001: tenant scoped, via public.clinic_of_current_user()
-- ----------------------------------------------------------------------------
ALTER TABLE public.insights_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insights_chats_select_own ON public.insights_chats;
CREATE POLICY insights_chats_select_own ON public.insights_chats
  FOR SELECT TO authenticated, anon
  USING (
    staff_id IN (
      SELECT s.id FROM public.staff s
      WHERE s.auth_user_id = auth.uid() AND s.is_active = true
    )
  );

DROP POLICY IF EXISTS insights_chats_insert_own ON public.insights_chats;
CREATE POLICY insights_chats_insert_own ON public.insights_chats
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.clinic_of_current_user()
    AND staff_id IN (
      SELECT s.id FROM public.staff s
      WHERE s.auth_user_id = auth.uid() AND s.is_active = true
    )
  );

DROP POLICY IF EXISTS insights_chats_update_own ON public.insights_chats;
CREATE POLICY insights_chats_update_own ON public.insights_chats
  FOR UPDATE TO authenticated
  USING (
    staff_id IN (
      SELECT s.id FROM public.staff s
      WHERE s.auth_user_id = auth.uid() AND s.is_active = true
    )
  )
  WITH CHECK (
    clinic_id = public.clinic_of_current_user()
    AND staff_id IN (
      SELECT s.id FROM public.staff s
      WHERE s.auth_user_id = auth.uid() AND s.is_active = true
    )
  );

ALTER TABLE public.insights_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insights_chat_messages_select_own ON public.insights_chat_messages;
CREATE POLICY insights_chat_messages_select_own ON public.insights_chat_messages
  FOR SELECT TO authenticated, anon
  USING (
    chat_id IN (
      SELECT c.id FROM public.insights_chats c
      WHERE c.staff_id IN (
        SELECT s.id FROM public.staff s
        WHERE s.auth_user_id = auth.uid() AND s.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS insights_chat_messages_insert_own ON public.insights_chat_messages;
CREATE POLICY insights_chat_messages_insert_own ON public.insights_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    chat_id IN (
      SELECT c.id FROM public.insights_chats c
      WHERE c.clinic_id = public.clinic_of_current_user()
        AND c.staff_id IN (
          SELECT s.id FROM public.staff s
          WHERE s.auth_user_id = auth.uid() AND s.is_active = true
        )
    )
  );

-- (No UPDATE/DELETE policies on messages: a thread is append-only. A staff
--  member "deleting history" just starts a new chat.)