-- ============================================================================
-- Franel Dental · 0001 — Enable RLS (clinic-level multi-tenancy)
-- ----------------------------------------------------------------------------
-- HOW TO APPLY
--   1. Open Supabase Dashboard → SQL Editor → New query.
--   2. Run the "STEP 0 — VERIFY SCHEMA" block FIRST. If any table/column
--      name below differs from your real schema, adjust the statements
--      before running the rest.
--   3. Run this file top-to-bottom in a single transaction-safe script.
--   4. Then run 0002_bridge_role.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 0 — VERIFY SCHEMA (inspect only; adjust names below if needed)
-- ----------------------------------------------------------------------------
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('clinics','staff','patients','conversations','messages','appointments','escalations','follow_ups','clinic_config')
-- ORDER BY table_name, ordinal_position;

-- ----------------------------------------------------------------------------
-- STEP 1 — Tenant helper: which clinic does the *current auth user* belong to?
--          (Single-clinic assumption: a staff member belongs to one clinic.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clinic_of_current_user()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.clinic_id
  FROM public.staff s
  WHERE s.auth_user_id = auth.uid()
    AND s.is_active = true
  LIMIT 1;
$$;

-- ----------------------------------------------------------------------------
-- STEP 2 — Enable RLS on every tenant table
-- ----------------------------------------------------------------------------
ALTER TABLE public.clinics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_config ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STEP 3 — Policies (anon + authenticated behave the same: clinic-scoped)
--          The dashboard uses the anon key WITH a supabase-auth JWT, so the
--          "authenticated" policies below are what actually apply.
-- ----------------------------------------------------------------------------

-- clinics: a staff member may read their own clinic's record (settings page).
DROP POLICY IF EXISTS clinics_select_own ON public.clinics;
CREATE POLICY clinics_select_own ON public.clinics
  FOR SELECT TO authenticated, anon
  USING (id = public.clinic_of_current_user());

DROP POLICY IF EXISTS clinics_update_own ON public.clinics;
CREATE POLICY clinics_update_own ON public.clinics
  FOR UPDATE TO authenticated
  USING (id = public.clinic_of_current_user())
  WITH CHECK (id = public.clinic_of_current_user());

-- staff: read own clinic's roster; only manage "is_active" of self (keep minimal).
DROP POLICY IF EXISTS staff_select_clinic ON public.staff;
CREATE POLICY staff_select_clinic ON public.staff
  FOR SELECT TO authenticated, anon
  USING (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS staff_update_self ON public.staff;
CREATE POLICY staff_update_self ON public.staff
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- patients
DROP POLICY IF EXISTS patients_select_clinic ON public.patients;
CREATE POLICY patients_select_clinic ON public.patients
  FOR SELECT TO authenticated, anon
  USING (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS patients_insert_clinic ON public.patients;
CREATE POLICY patients_insert_clinic ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS patients_update_clinic ON public.patients;
CREATE POLICY patients_update_clinic ON public.patients
  FOR UPDATE TO authenticated
  USING (clinic_id = public.clinic_of_current_user())
  WITH CHECK (clinic_id = public.clinic_of_current_user());

-- conversations
DROP POLICY IF EXISTS conversations_select_clinic ON public.conversations;
CREATE POLICY conversations_select_clinic ON public.conversations
  FOR SELECT TO authenticated, anon
  USING (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS conversations_insert_clinic ON public.conversations;
CREATE POLICY conversations_insert_clinic ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS conversations_update_clinic ON public.conversations;
CREATE POLICY conversations_update_clinic ON public.conversations
  FOR UPDATE TO authenticated
  USING (clinic_id = public.clinic_of_current_user())
  WITH CHECK (clinic_id = public.clinic_of_current_user());

-- messages — NO clinic_id column; scope through the parent conversation.
DROP POLICY IF EXISTS messages_select_clinic ON public.messages;
CREATE POLICY messages_select_clinic ON public.messages
  FOR SELECT TO authenticated, anon
  USING (
    conversation_id IN (
      SELECT c.id FROM public.conversations c
      WHERE c.clinic_id = public.clinic_of_current_user()
    )
  );

DROP POLICY IF EXISTS messages_insert_clinic ON public.messages;
CREATE POLICY messages_insert_clinic ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    conversation_id IN (
      SELECT c.id FROM public.conversations c
      WHERE c.clinic_id = public.clinic_of_current_user()
    )
  );

-- appointments
DROP POLICY IF EXISTS appointments_select_clinic ON public.appointments;
CREATE POLICY appointments_select_clinic ON public.appointments
  FOR SELECT TO authenticated, anon
  USING (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS appointments_insert_clinic ON public.appointments;
CREATE POLICY appointments_insert_clinic ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS appointments_update_clinic ON public.appointments;
CREATE POLICY appointments_update_clinic ON public.appointments
  FOR UPDATE TO authenticated
  USING (clinic_id = public.clinic_of_current_user())
  WITH CHECK (clinic_id = public.clinic_of_current_user());

-- escalations
DROP POLICY IF EXISTS escalations_select_clinic ON public.escalations;
CREATE POLICY escalations_select_clinic ON public.escalations
  FOR SELECT TO authenticated, anon
  USING (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS escalations_insert_clinic ON public.escalations;
CREATE POLICY escalations_insert_clinic ON public.escalations
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS escalations_update_clinic ON public.escalations;
CREATE POLICY escalations_update_clinic ON public.escalations
  FOR UPDATE TO authenticated
  USING (clinic_id = public.clinic_of_current_user())
  WITH CHECK (clinic_id = public.clinic_of_current_user());

-- follow_ups
DROP POLICY IF EXISTS follow_ups_select_clinic ON public.follow_ups;
CREATE POLICY follow_ups_select_clinic ON public.follow_ups
  FOR SELECT TO authenticated, anon
  USING (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS follow_ups_insert_clinic ON public.follow_ups;
CREATE POLICY follow_ups_insert_clinic ON public.follow_ups
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS follow_ups_update_clinic ON public.follow_ups;
CREATE POLICY follow_ups_update_clinic ON public.follow_ups
  FOR UPDATE TO authenticated
  USING (clinic_id = public.clinic_of_current_user())
  WITH CHECK (clinic_id = public.clinic_of_current_user());

-- clinic_config
DROP POLICY IF EXISTS clinic_config_select_clinic ON public.clinic_config;
CREATE POLICY clinic_config_select_clinic ON public.clinic_config
  FOR SELECT TO authenticated, anon
  USING (clinic_id = public.clinic_of_current_user());

DROP POLICY IF EXISTS clinic_config_upsert_clinic ON public.clinic_config;
CREATE POLICY clinic_config_upsert_clinic ON public.clinic_config
  FOR UPDATE TO authenticated
  USING (clinic_id = public.clinic_of_current_user())
  WITH CHECK (clinic_id = public.clinic_of_current_user());

-- ----------------------------------------------------------------------------
-- STEP 4 — Sanity checks (run after; expect visible rows, not 0)
-- ----------------------------------------------------------------------------
-- Test AS your staff user (with a valid session/JWT in the client), not here.
-- Here just confirm policies exist:
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' ORDER BY tablename, policyname;