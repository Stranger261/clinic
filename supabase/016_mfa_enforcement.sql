-- Two-step verification (2FA) is enforced in the database, not just in the pages.
-- If a patient turned 2FA on, their session must have completed the code step (aal2) before any of
-- their personal-data functions will answer. Someone with only a Google sign-in cannot get around it
-- by calling the API directly. Patients who have not turned 2FA on are not affected.
--
-- Each function below is the latest version of that function, with one added line at the top:
--   perform public.require_mfa();

-- Does this session satisfy the user's own 2FA choice?
-- True when the session already passed the code step, or when the user has no verified 2FA factor.
create function public.mfa_satisfied()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors
        where user_id = (select auth.uid()) and status = 'verified'
      );
$$;

-- Stops the function that calls it, with its own error code (PR002), when 2FA is not satisfied.
create function public.require_mfa()
returns void
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.mfa_satisfied() then
    raise exception 'Two-step verification is required.' using errcode = 'PR002';
  end if;
end;
$$;

-- The pages ask this to decide whether to show the code screen.
revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;
-- Only other functions use this one.
revoke execute on function public.require_mfa() from public, anon, authenticated;

-- book_slot
create or replace function public.book_slot(
  p_slot_id bigint,
  p_reason public.visit_reason,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid := (select auth.uid());
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.require_mfa();
  if v_patient is null then
    raise exception 'Please sign in to book.';
  end if;

  if p_reason is null then
    raise exception 'Please choose a reason for the visit.';
  end if;

  if char_length(coalesce(v_note, '')) > 150 then
    raise exception 'Please keep the note under 150 characters.';
  end if;

  if not exists (select 1 from public.profiles where id = v_patient and role = 'patient') then
    raise exception 'Only patients can book appointments.';
  end if;

  -- A custom error code (PR001) lets the app send the patient to the profile form, then back here.
  if not public.patient_profile_complete() then
    raise exception 'Please complete your profile before booking.' using errcode = 'PR001';
  end if;

  -- A patient cannot be in two places at once.
  if exists (
    select 1
    from public.appointments a
    join public.slots booked on booked.id = a.slot_id
    join public.slots wanted on wanted.id = p_slot_id
    where a.patient_id = v_patient
      and a.status = 'confirmed'
      and booked.starts_at < wanted.ends_at
      and booked.ends_at > wanted.starts_at
  ) then
    raise exception 'You already have an appointment at that time.';
  end if;

  -- Check and claim in ONE statement, so two people cannot both get the slot.
  update public.slots set status = 'booked'
  where id = p_slot_id and status = 'open' and starts_at > now();

  if not found then
    raise exception 'Sorry, that slot is no longer available.';
  end if;

  insert into public.appointments (slot_id, patient_id, visit_reason, visit_note)
  values (p_slot_id, v_patient, p_reason, v_note);
end;
$$;

-- cancel_appointment
create or replace function public.cancel_appointment(p_appointment_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_notice  constant interval := interval '24 hours';
  v_patient uuid := (select auth.uid());
  v_appt    public.appointments%rowtype;
  v_start   timestamptz;
begin
  perform public.require_mfa();
  if v_patient is null then
    raise exception 'Please sign in.';
  end if;

  -- "for update" locks this row, so two cancel clicks at the same moment
  -- run one after the other instead of both passing the checks below.
  select * into v_appt
  from public.appointments
  where id = p_appointment_id and patient_id = v_patient
  for update;

  if not found then
    raise exception 'Appointment not found.';
  end if;

  if v_appt.status <> 'confirmed' then
    raise exception 'This appointment is already cancelled.';
  end if;

  select starts_at into v_start from public.slots where id = v_appt.slot_id;

  if v_start - now() < c_notice then
    raise exception 'Appointments can only be cancelled at least 24 hours before they start.';
  end if;

  -- Both changes happen together: cancel it AND give the slot back.
  update public.appointments set status = 'cancelled' where id = v_appt.id;
  update public.slots set status = 'open' where id = v_appt.slot_id and status = 'booked';
end;
$$;

-- request_reschedule
create or replace function public.request_reschedule(p_appointment_id bigint, p_new_slot_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_window  constant interval := interval '24 hours';
  v_patient uuid := (select auth.uid());
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_appt    public.appointments%rowtype;
  v_old     public.slots%rowtype;
  v_new     public.slots%rowtype;
begin
  perform public.require_mfa();
  if v_patient is null then
    raise exception 'Please sign in.';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'Please describe the emergency in at least 10 characters.';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Please keep the reason under 500 characters.';
  end if;

  perform public.expire_stale_requests();

  select * into v_appt
  from public.appointments
  where id = p_appointment_id and patient_id = v_patient
  for update;
  if not found then
    raise exception 'Appointment not found.';
  end if;
  if v_appt.status <> 'confirmed' then
    raise exception 'This appointment is not active.';
  end if;

  if exists (select 1 from public.reschedule_requests where appointment_id = v_appt.id and status = 'pending') then
    raise exception 'You already have a pending request for this appointment.';
  end if;

  select * into v_old from public.slots where id = v_appt.slot_id;
  if v_old.starts_at <= now() then
    raise exception 'This appointment has already started.';
  end if;
  if v_old.starts_at - now() >= c_window then
    raise exception 'You can still cancel this appointment, so no emergency request is needed.';
  end if;

  select * into v_new from public.slots where id = p_new_slot_id;
  if not found or v_new.doctor_id <> v_old.doctor_id then
    raise exception 'Please choose a slot with the same doctor.';
  end if;
  if v_new.id = v_old.id then
    raise exception 'Please choose a different slot.';
  end if;

  -- The patient cannot be in two places at once (ignoring the visit being moved).
  if exists (
    select 1
    from public.appointments a
    join public.slots s on s.id = a.slot_id
    where a.patient_id = v_patient and a.status = 'confirmed' and a.id <> v_appt.id
      and s.starts_at < v_new.ends_at and s.ends_at > v_new.starts_at
  ) then
    raise exception 'You already have an appointment at that time.';
  end if;

  -- Hold the new slot: check and claim in one statement.
  update public.slots set status = 'held'
  where id = p_new_slot_id and status = 'open' and starts_at > now();
  if not found then
    raise exception 'Sorry, that slot is no longer available.';
  end if;

  insert into public.reschedule_requests (appointment_id, old_slot_id, new_slot_id, reason)
  values (v_appt.id, v_old.id, v_new.id, v_reason);
end;
$$;

-- withdraw_reschedule
create or replace function public.withdraw_reschedule(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.reschedule_requests%rowtype;
begin
  perform public.require_mfa();
  perform public.expire_stale_requests();

  select r.* into v_req
  from public.reschedule_requests r
  join public.appointments a on a.id = r.appointment_id
  where r.id = p_request_id and a.patient_id = (select auth.uid())
  for update of r;
  if not found then
    raise exception 'Request not found.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request is no longer pending.';
  end if;

  update public.reschedule_requests set status = 'withdrawn', decided_at = now() where id = v_req.id;
  update public.slots set status = 'open' where id = v_req.new_slot_id and status = 'held';
end;
$$;

-- my_appointments
create or replace function public.my_appointments()
returns table (
  appointment_id bigint,
  status public.appointment_status,
  slot_start timestamptz,
  slot_end timestamptz,
  doctor_name text,
  department_name text,
  request_id bigint,
  request_status public.request_status,
  request_new_start timestamptz,
  request_note text,
  visit_reason public.visit_reason,
  visit_note text,
  outcome public.visit_outcome
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_mfa();
  perform public.expire_stale_requests();
  return query
  select a.id, a.status, s.starts_at, s.ends_at, p.full_name, dep.name,
         r.id, r.status, ns.starts_at, r.decision_note,
         a.visit_reason, a.visit_note, a.outcome
  from public.appointments a
  join public.slots s on s.id = a.slot_id
  join public.doctors d on d.id = s.doctor_id
  join public.profiles p on p.id = d.profile_id
  join public.departments dep on dep.id = d.department_id
  left join lateral (
    select * from public.reschedule_requests rr
    where rr.appointment_id = a.id
    order by rr.created_at desc, rr.id desc
    limit 1
  ) r on true
  left join public.slots ns on ns.id = r.new_slot_id
  where a.patient_id = (select auth.uid())
  order by s.starts_at desc;
end;
$$;

-- save_patient_profile
create or replace function public.save_patient_profile(
  p_full_name       text,
  p_date_of_birth   date,
  p_sex             public.patient_sex,
  p_phone           text,
  p_address         text,
  p_emergency_name  text,
  p_emergency_phone text,
  p_allergies       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := (select auth.uid());
  v_today      date := (now() at time zone 'Asia/Manila')::date;
  v_name       text := btrim(coalesce(p_full_name, ''));
  v_phone      text := btrim(coalesce(p_phone, ''));
  v_address    text := btrim(coalesce(p_address, ''));
  v_em_name    text := btrim(coalesce(p_emergency_name, ''));
  v_em_phone   text := btrim(coalesce(p_emergency_phone, ''));
  v_allergies  text := nullif(btrim(coalesce(p_allergies, '')), '');
begin
  perform public.require_mfa();
  if v_user is null or not exists (select 1 from public.profiles where id = v_user and role = 'patient') then
    raise exception 'Only patients have a patient profile.';
  end if;

  if char_length(v_name) not between 2 and 100 then
    raise exception 'Please enter your full name.';
  end if;
  if p_date_of_birth is null or p_date_of_birth > v_today or p_date_of_birth < v_today - interval '120 years' then
    raise exception 'Please enter a valid date of birth.';
  end if;
  if p_sex is null then
    raise exception 'Please choose an option for sex.';
  end if;
  if v_phone !~ '^[0-9+() -]+$' or char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 7 and 15 then
    raise exception 'Please enter a valid mobile number.';
  end if;
  if char_length(v_address) not between 5 and 200 then
    raise exception 'Please enter your address.';
  end if;
  if char_length(v_em_name) not between 2 and 100 then
    raise exception 'Please enter the name of your emergency contact.';
  end if;
  if v_em_phone !~ '^[0-9+() -]+$' or char_length(regexp_replace(v_em_phone, '[^0-9]', '', 'g')) not between 7 and 15 then
    raise exception 'Please enter a valid emergency contact number.';
  end if;
  if regexp_replace(v_phone, '[^0-9]', '', 'g') = regexp_replace(v_em_phone, '[^0-9]', '', 'g') then
    raise exception 'The emergency contact needs a different number from your own.';
  end if;
  if char_length(coalesce(v_allergies, '')) > 300 then
    raise exception 'Please keep allergies under 300 characters.';
  end if;

  insert into public.patient_profiles
    (profile_id, date_of_birth, sex, phone, address, emergency_name, emergency_phone, allergies, updated_at)
  values
    (v_user, p_date_of_birth, p_sex, v_phone, v_address, v_em_name, v_em_phone, v_allergies, now())
  on conflict (profile_id) do update set
    date_of_birth   = excluded.date_of_birth,
    sex             = excluded.sex,
    phone           = excluded.phone,
    address         = excluded.address,
    emergency_name  = excluded.emergency_name,
    emergency_phone = excluded.emergency_phone,
    allergies       = excluded.allergies,
    updated_at      = now();

  update public.profiles set full_name = v_name where id = v_user;
end;
$$;

-- get_my_patient_profile was a plain SQL function; it becomes a small PL/pgSQL one so it can check first.
create or replace function public.get_my_patient_profile()
returns table (
  full_name text,
  date_of_birth date,
  sex public.patient_sex,
  phone text,
  address text,
  emergency_name text,
  emergency_phone text,
  allergies text,
  patient_no bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  perform public.require_mfa();
  return query
  select p.full_name, pp.date_of_birth, pp.sex, pp.phone, pp.address,
         pp.emergency_name, pp.emergency_phone, pp.allergies, pp.patient_no
  from public.profiles p
  left join public.patient_profiles pp on pp.profile_id = p.id
  where p.id = (select auth.uid());
end;
$$;
