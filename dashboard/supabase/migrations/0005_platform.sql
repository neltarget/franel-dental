-- 0005_platform.sql — multi-clinic platform (D1–D10, 1A, 2A). Additive, idempotent.
-- Existing single-tenant rows keep working: no NOT NULLs without defaults,
-- HarbourView backfilled to active, RLS additions are pure grants.

-- 1. Platform accounts
create table if not exists public.platform_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  email text unique not null,
  role text not null default 'platform_admin' check (role in ('platform_admin','platform_support')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Plans and billing
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  price_gbp numeric(10,2) not null default 0,
  currency text not null default 'GBP',
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','annual')),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.clinics
  add column if not exists plan_id uuid references public.plans(id) on delete set null;
alter table public.clinics
  add column if not exists renews_at timestamptz;

-- 3. WhatsApp channel (one number per clinic; gateway = single token home)
alter table public.clinics
  add column if not exists wa_phone_number_id text unique;
alter table public.clinics
  add column if not exists wa_number text;
alter table public.clinics
  add column if not exists wa_status text not null default 'pending'
    check (wa_status in ('pending','linking','active','error'));
alter table public.clinics
  add column if not exists wa_display_name text;
alter table public.clinics
  add column if not exists wa_templates_status jsonb not null default '{}'::jsonb;

-- 4. Google Calendar (one calendar per clinic; sync reads calendar_id live)
alter table public.clinics
  add column if not exists calendar_id text unique;

-- 5. Lifecycle (trial is the default; suspended = pause agent + dashboard)
alter table public.clinics
  add column if not exists status text not null default 'trial'
    check (status in ('trial','active','suspended'));
update public.clinics set status = 'active' where status = 'trial';  -- pre-platform rows are live
alter table public.clinics
  add column if not exists onboarded_at timestamptz;

alter table public.clinic_config
  add column if not exists ops_heartbeat_at timestamptz;

-- 6. settings_version — agent config cache invalidation (2A).
--    Bumped only on real settings columns so heartbeat/ops writes don't invalidate caches.
create or replace function public.bump_settings_version() returns trigger
  language plpgsql as $$
begin
  if (
    (tg_op = 'UPDATE') and
    (
      (new.name is distinct from old.name) or
      (new.address is distinct from old.address) or
      (new.phone is distinct from old.phone) or
      (new.email is distinct from old.email) or
      (new.logo_url is distinct from old.logo_url) or
      (new.hours is distinct from old.hours) or
      (new.services is distinct from old.services) or
      (new.pricing is distinct from old.pricing) or
      (new.policies is distinct from old.policies)
    )
  ) then
    new.settings_version = old.settings_version + 1;
  end if;
  return new;
end $$;
alter table public.clinics
  add column if not exists settings_version int not null default 0;
drop trigger if exists clinics_bump_settings_version on public.clinics;
create trigger clinics_bump_settings_version
  before update on public.clinics
  for each row execute function public.bump_settings_version();

-- 7. Usage metering (gated in app code; billable events only)
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  event_type text not null
    check (event_type in ('incoming_message','outbound_message','appointment_created','voice_minutes')),
  amount int not null default 1 check (amount > 0),
  ref_type text,
  ref_id text,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_clinic_month_idx
  on public.usage_events (clinic_id, created_at desc);

-- 8. Console audit (peek + suspend + plan changes, service-role writes)
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  actor_email text not null,
  action text not null,
  target_type text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_clinic_idx on public.audit_log (clinic_id, created_at desc);

-- 9. RLS (new tables are RLS-enabled; platform access via auth claims checked by helper)
create or replace function public.current_user_is_platform() returns boolean
  language sql security definer stable as $$
  select exists (
    select 1 from public.platform_users
    where auth_user_id = auth.uid() and is_active
  );
$$;

alter table public.platform_users enable row level security;
alter table public.plans enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "platform_users_platform_read" on public.platform_users;
create policy "platform_users_platform_read" on public.platform_users
  for select using (public.current_user_is_platform());

drop policy if exists "plans_readable_by_platform_and_own_clinics" on public.plans;
create policy "plans_readable_by_platform_and_own_clinics" on public.plans
  for select using (
    is_active
    and (public.current_user_is_platform()
      or exists (select 1 from public.clinics c where c.plan_id = plans.id and c.id = public.clinic_of_current_user()))
  );

drop policy if exists "plans_writable_by_platform" on public.plans;
create policy "plans_writable_by_platform" on public.plans
  for all using (public.current_user_is_platform())
  with check (public.current_user_is_platform());

drop policy if exists "clinics_select_all_for_platform" on public.clinics;
create policy "clinics_select_all_for_platform" on public.clinics
  for select using (public.current_user_is_platform());

drop policy if exists "clinics_update_all_for_platform" on public.clinics;
create policy "clinics_update_all_for_platform" on public.clinics
  for update using (public.current_user_is_platform())
  with check (public.current_user_is_platform());

drop policy if exists "clinic_config_select_all_for_platform" on public.clinic_config;
create policy "clinic_config_select_all_for_platform" on public.clinic_config
  for select using (
    public.current_user_is_platform()
    or clinic_id = public.clinic_of_current_user()
  );

drop policy if exists "clinic_config_update_all_for_platform" on public.clinic_config;
create policy "clinic_config_update_all_for_platform" on public.clinic_config
  for update using (public.current_user_is_platform())
  with check (public.current_user_is_platform());

drop policy if exists "patients_select_for_platform" on public.patients;
create policy "patients_select_for_platform" on public.patients
  for select using (
    public.current_user_is_platform()
    or clinic_id = public.clinic_of_current_user()
  );

drop policy if exists "conversations_select_for_platform" on public.conversations;
create policy "conversations_select_for_platform" on public.conversations
  for select using (
    public.current_user_is_platform()
    or clinic_id = public.clinic_of_current_user()
  );

-- messages has no clinic_id: reach it through the conversation (same pattern as 0001)
drop policy if exists "messages_select_for_platform" on public.messages;
create policy "messages_select_for_platform" on public.messages
  for select using (
    public.current_user_is_platform()
    or conversation_id in (
      select c.id from public.conversations c
      where c.clinic_id = public.clinic_of_current_user()
    )
  );

drop policy if exists "appointments_select_for_platform" on public.appointments;
create policy "appointments_select_for_platform" on public.appointments
  for select using (
    public.current_user_is_platform()
    or clinic_id = public.clinic_of_current_user()
  );

drop policy if exists "escalations_select_for_platform" on public.escalations;
create policy "escalations_select_for_platform" on public.escalations
  for select using (
    public.current_user_is_platform()
    or clinic_id = public.clinic_of_current_user()
  );

drop policy if exists "usage_events_select_for_platform" on public.usage_events;
create policy "usage_events_select_for_platform" on public.usage_events
  for select using (
    public.current_user_is_platform()
    or clinic_id = public.clinic_of_current_user()
  );

drop policy if exists "audit_log_select_for_platform" on public.audit_log;
create policy "audit_log_select_for_platform" on public.audit_log
  for select using (
    public.current_user_is_platform()
    or clinic_id = public.clinic_of_current_user()
  );