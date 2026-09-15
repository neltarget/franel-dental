-- ============================================================================
-- Franel Dental · 0003 — Seed HarbourView Dental Clinic (run AFTER 0001, 0002)
-- ----------------------------------------------------------------------------
-- Source of truth: ~/.hermes/skills/franel-dental-patient-conversion/
--                  references/clinic-profile.md (verified profile v2.0, Accra)
--
-- Owner flow (~30 s):
--   1. Run this file top-to-bottom (it's fully idempotent, re-runnable).
--   2. The auth user (admin@harbourviewdental.com) already exists in
--      Supabase Authentication; the staff row is seeded with its real uuid,
--      so the dashboard can sign in and resolve the clinic immediately.
--      If the auth account is ever regenerated, update the uuid in section 2
--      and re-run the file.
--
-- All ids are fixed so the sync daemon (and 0004 cron) can reference them
-- without any lookup. Re-running this file is a no-op (ON CONFLICT etc.).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Clinic
-- ----------------------------------------------------------------------------
INSERT INTO public.clinics
  (id, name, address, phone, email, logo_url, hours, services, pricing, policies, created_at, updated_at)
VALUES
  (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- HVB CLINIC (fixed id)
    'HarbourView Dental Clinic',
    '18 Meridian Avenue, North Legon, Accra, Ghana',
    '+233503585763',                          -- WhatsApp line (also used as the main phone)
    'targetnelly@gmail.com',                  -- verify: clinic profile lists this as the contact email
    NULL,
    '{"monday":"08:30 – 17:30","tuesday":"08:30 – 17:30","wednesday":"08:30 – 17:30","thursday":"08:30 – 17:30","friday":"08:30 – 17:30","saturday":"09:00 – 14:00","sunday":"Closed"}'::jsonb,
    '[
      {"name":"General dental consultation","description":"30-min exam, X-ray if needed, treatment plan. Dr. Daniel Mensah or team."},
      {"name":"Child dental examination","description":"30-min gentle check-up for kids. Preventive, fluoride, sealants."},
      {"name":"Emergency assessment","description":"30-min urgent slot for pain, swelling, fracture. During clinic hours."},
      {"name":"Scaling and polishing","description":"45-min professional cleaning. Plaque/calculus removal, gum check."},
      {"name":"Teeth whitening","description":"In-clinic whitening from GHS 1,500. Suitability checked before treatment."},
      {"name":"Composite filling","description":"Tooth-coloured filling from GHS 350/tooth after assessment."},
      {"name":"Root canal treatment","description":"From GHS 2,000/tooth. Assessment first; 60–90 min."},
      {"name":"Crowns and bridges","description":"Restorative crowns/bridges after assessment by the dental team."},
      {"name":"Veneers","description":"From GHS 3,000/tooth. Cosmetic consultation required first."},
      {"name":"Fixed braces","description":"Orthodontic consultation GHS 200; treatment from GHS 10,000 (full plan)."},
      {"name":"Clear aligners","description":"From GHS 15,000. Orthodontic assessment by Dr. Nadia Asare."},
      {"name":"Dental implants","description":"Consultation GHS 250; single implant from GHS 8,000. Clinical consult required."}
    ]'::jsonb,
    '{"General dental consultation":"GHS 150","Child dental consultation":"GHS 150","Emergency consultation":"GHS 200","Orthodontic consultation":"GHS 200","Implant consultation":"GHS 250","Scaling and polishing":"From GHS 300","Composite filling":"From GHS 350 per tooth","Teeth whitening":"From GHS 1,500","Root canal treatment":"From GHS 2,000 per tooth","Veneer":"From GHS 3,000 per tooth","Fixed braces":"From GHS 10,000 (full plan)","Clear aligners":"From GHS 15,000","Single dental implant":"From GHS 8,000"}'::jsonb,
    '{"cancellation":"Please give 24 hours'' notice to reschedule."}'::jsonb,
    now(), now()
  )
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2) Owner staff row (auth link).
--    The auth user already exists (admin@harbourviewdental.com). The
--    auth_user_id below is that user's real uuid (required: staff.auth_user_id
--    is a hard FK to auth.users, so a placeholder can't be inserted).
--    If the auth account is ever regenerated, update this value and run the
--    single UPDATE at the bottom of this section again.
-- ----------------------------------------------------------------------------
INSERT INTO public.staff
  (id, clinic_id, auth_user_id, name, role, phone, email, is_active, created_at)
VALUES
  (
    'e0925313-d076-45f4-9b42-5167d503d5e4',  -- HVB STAFF OWNER (fixed id)
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- HVB CLINIC
    '4e6ff05e-a075-409b-89c1-fd96b697a5f5',  -- admin@harbourviewdental.com (real)
    'Admin',
    'owner',
    '+233503585763',
    'targetnelly@gmail.com',
    true,
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- ── after creating the auth user, run this once (replace the uuid): ────────
-- UPDATE public.staff
--    SET auth_user_id = '<paste-new-auth-user-uuid>'
--  WHERE id = 'e0925313-d076-45f4-9b42-5167d503d5e4';

-- ----------------------------------------------------------------------------
-- 3) Clinic config (defaults matching the Franel reminder pipeline cadence)
--    reminder_hours_before=24 → franel_reminders R1 "day-before" window
--    checkin_hours_after=48    → R5 post-visit touch window
--    checkin_flag_timeout_hours=24 → no-show flag window (R6)
-- ----------------------------------------------------------------------------
INSERT INTO public.clinic_config
  (clinic_id, follow_up_intervals, reminder_hours_before, checkin_hours_after,
   checkin_flag_timeout_hours, whatsapp_templates, created_at, updated_at)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- HVB CLINIC
   '{"booking_reminder":24,"post_visit_checkin":48,"no_show_rebook":48}'::jsonb,
   24, 48, 24,
   '{}'::jsonb,
   now(), now())
ON CONFLICT (clinic_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Verify after running (in the SQL editor):
--   SELECT id,name FROM public.clinics;
--   SELECT id,name,role,is_active, auth_user_id FROM public.staff;
--   SELECT clinic_id, reminder_hours_before, checkin_hours_after FROM public.clinic_config;
-- Then, in the browser app, sign in with the auth user you created → the
-- Layout resolves clinic via staff.auth_user_id and everything else loads.
-- ============================================================================