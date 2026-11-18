-- Staff roles, step 2 of 2 (run after 018a): admin-assigned nurse and receptionist roles, and the first part of
-- the visit flow: reception checks a patient in, and the nurse sees who is waiting.
-- Clinic time zone 'Asia/Manila' must match lib/clinic.ts.

-- Does the signed-in user have this role? (compares as text) Only other functions use this.
create function public.has_role(p_role text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role::text = p_role);
$$;
revoke execute on function public.has_role(text) from public, anon, authenticated;

-- ---------- Admin: give a signed-up user a staff role, or take it away ----------
create function public.assign_staff_role(p_profile_id uuid, p_role text, p_department_id bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_mfa();
  if not public.is_admin() then
    raise exception 'Only admins can do this.';
  end if;
  if p_role is null or p_role not in ('doctor', 'nurse', 'receptionist') then
    raise exception 'Choose a role for this person.';
  end if;
  if p_role = 'doctor' and p_department_id is null then
    raise exception 'Choose a department for a doctor.';
  end if;

  update public.profiles set role = p_role::public.user_role
  where id = p_profile_id and role = 'patient';
  if not found then
    raise exception 'That user was not found or is not a patient.';
  end if;

  if p_role = 'doctor' then
    insert into public.doctors (profile_id, department_id) values (p_profile_id, p_department_id);
  end if;
end;
$$;

-- Nurses and receptionists become patients again. (Doctors are removed with remove_doctor.)
create function public.remove_staff_role(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_mfa();
  if not public.is_admin() then
    raise exception 'Only admins can do this.';
  end if;
  update public.profiles set role = 'patient'
  where id = p_profile_id and role::text in ('nurse', 'receptionist');
  if not found then
    raise exception 'That person was not found, or is a doctor (remove doctors from the doctors list).';
  end if;
end;
$$;

-- ---------- The visit: starts when reception checks the patient in ----------
create type visit_stage as enum ('checked_in', 'ready', 'in_consultation', 'completed');

create table visits (
  id             bigint generated always as identity primary key,
  appointment_id bigint not null unique references appointments (id) on delete cascade,
  stage          visit_stage not null default 'checked_in',
  checked_in_at  timestamptz not null default now(),
  checked_in_by  uuid not null references profiles (id),
  created_at     timestamptz not null default now()
);
-- Deny by default: visits are reached only through functions.
alter table visits enable row level security;

-- Reception checks a patient in: from 2 hours before the visit until an hour after its end.
create function public.check_in(p_appointment_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_slot public.slots%rowtype;
begin
  perform public.require_mfa();
  if not public.has_role('receptionist') then
    raise exception 'Only reception staff can check patients in.';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found or v_appt.status <> 'confirmed' then
    raise exception 'That appointment was not found or is not active.';
  end if;
  if v_appt.outcome is not null then
    raise exception 'This visit is already closed.';
  end if;

  select * into v_slot from public.slots where id = v_appt.slot_id;
  if now() < v_slot.starts_at - interval '2 hours' then
    raise exception 'Too early to check in. Check-in opens 2 hours before the visit.';
  end if;
  if now() > v_slot.ends_at + interval '60 minutes' then
    raise exception 'This appointment time has passed.';
  end if;
  if exists (select 1 from public.visits where appointment_id = v_appt.id) then
    raise exception 'This patient is already checked in.';
  end if;

  insert into public.visits (appointment_id, checked_in_by) values (v_appt.id, (select auth.uid()));
end;
$$;

-- Reception's list for one day. It shows who is coming and whether they have arrived: name, patient number,
-- phone and age (to confirm identity), but no health details and no reason for the visit.
create function public.reception_schedule(p_date date default null)
returns table (
  appointment_id bigint,
  slot_start timestamptz,
  slot_end timestamptz,
  doctor_name text,
  department_name text,
  patient_name text,
  patient_no bigint,
  patient_phone text,
  patient_age integer,
  outcome public.visit_outcome,
  stage public.visit_stage,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := coalesce(p_date, (now() at time zone 'Asia/Manila')::date);
begin
  perform public.require_mfa();
  if not public.has_role('receptionist') then
    raise exception 'Only reception staff can view this.';
  end if;

  return query
  select a.id, s.starts_at, s.ends_at, dr.full_name, dep.name,
         pr.full_name, pp.patient_no, pp.phone,
         case when pp.profile_id is null then null
              else date_part('year', age((now() at time zone 'Asia/Manila')::date, pp.date_of_birth))::integer end,
         a.outcome, v.stage, v.checked_in_at
  from public.appointments a
  join public.slots s on s.id = a.slot_id
  join public.doctors d on d.id = s.doctor_id
  join public.profiles dr on dr.id = d.profile_id
  join public.departments dep on dep.id = d.department_id
  join public.profiles pr on pr.id = a.patient_id
  left join public.patient_profiles pp on pp.profile_id = a.patient_id
  left join public.visits v on v.appointment_id = a.id
  where a.status = 'confirmed'
    and s.starts_at >= (v_day::timestamp at time zone 'Asia/Manila')
    and s.starts_at <  ((v_day + 1)::timestamp at time zone 'Asia/Manila')
  order by s.starts_at, dr.full_name;
end;
$$;

-- The nurse's waiting list: patients who are checked in and need their vitals taken.
-- The nurse sees what triage needs (age, sex, allergies, reason for the visit).
create function public.nurse_queue()
returns table (
  visit_id bigint,
  appointment_id bigint,
  slot_start timestamptz,
  doctor_name text,
  patient_name text,
  patient_no bigint,
  patient_age integer,
  patient_sex public.patient_sex,
  allergies text,
  visit_reason public.visit_reason,
  visit_note text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_mfa();
  if not public.has_role('nurse') then
    raise exception 'Only nurses can view this.';
  end if;

  return query
  select v.id, a.id, s.starts_at, dr.full_name,
         pr.full_name, pp.patient_no,
         case when pp.profile_id is null then null
              else date_part('year', age((now() at time zone 'Asia/Manila')::date, pp.date_of_birth))::integer end,
         pp.sex, pp.allergies, a.visit_reason, a.visit_note, v.checked_in_at
  from public.visits v
  join public.appointments a on a.id = v.appointment_id
  join public.slots s on s.id = a.slot_id
  join public.doctors d on d.id = s.doctor_id
  join public.profiles dr on dr.id = d.profile_id
  join public.profiles pr on pr.id = a.patient_id
  left join public.patient_profiles pp on pp.profile_id = a.patient_id
  where v.stage = 'checked_in'
    and a.status = 'confirmed'
    and a.outcome is null
  order by v.checked_in_at;
end;
$$;

revoke execute on function public.assign_staff_role(uuid, text, bigint) from public, anon;
revoke execute on function public.remove_staff_role(uuid) from public, anon;
revoke execute on function public.check_in(bigint) from public, anon;
revoke execute on function public.reception_schedule(date) from public, anon;
revoke execute on function public.nurse_queue() from public, anon;
grant execute on function public.assign_staff_role(uuid, text, bigint) to authenticated;
grant execute on function public.remove_staff_role(uuid) to authenticated;
grant execute on function public.check_in(bigint) to authenticated;
grant execute on function public.reception_schedule(date) to authenticated;
grant execute on function public.nurse_queue() to authenticated;

-- ---------- The demo gets a nurse and a receptionist (optional demo users) ----------
-- Same as in 014, plus those two users. Create demo-nurse@ and demo-receptionist@clinic.example in
-- Supabase first, then run:  select public.reset_demo_data();
create or replace function public.reset_demo_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_tz        constant text := 'Asia/Manila';
  v_admin     uuid;
  v_doctor    uuid;
  v_patient   uuid;
  v_dept      bigint;
  v_doctor_id bigint;
  v_soon      bigint;
  v_later     bigint;
  v_started   bigint;
  v_nurse     uuid;
  v_reception uuid;
begin
  select id into v_admin   from public.profiles where email = 'demo-admin@clinic.example';
  select id into v_doctor  from public.profiles where email = 'demo-doctor@clinic.example';
  select id into v_patient from public.profiles where email = 'demo-patient@clinic.example';

  if v_admin is null or v_doctor is null or v_patient is null then
    raise exception 'Create the three demo users in Supabase Authentication first.';
  end if;

  -- Visitors will try to break things. Repair what they could have changed.
  delete from public.appointments where patient_id = v_patient;
  delete from public.doctors where profile_id = v_patient;

  update public.profiles set full_name = 'Demo Admin',   role = 'admin'   where id = v_admin;
  update public.profiles set full_name = 'Dr. Demo',     role = 'doctor'  where id = v_doctor;
  update public.profiles set full_name = 'Demo Patient', role = 'patient' where id = v_patient;

  -- The nurse and receptionist demo users are optional, so older demo setups keep working.
  select id into v_nurse     from public.profiles where email = 'demo-nurse@clinic.example';
  select id into v_reception from public.profiles where email = 'demo-receptionist@clinic.example';
  if v_nurse is not null then
    update public.profiles set full_name = 'Demo Nurse', role = 'nurse' where id = v_nurse;
  end if;
  if v_reception is not null then
    update public.profiles set full_name = 'Demo Receptionist', role = 'receptionist' where id = v_reception;
  end if;

  insert into public.patient_profiles
    (profile_id, date_of_birth, sex, phone, address, emergency_name, emergency_phone, allergies, updated_at)
  values
    (v_patient, date '1990-05-14', 'prefer_not_to_say', '0900 000 0001', '12 Sample Street, Demo City',
     'Sample Contact', '0900 000 0002', 'None known', now())
  on conflict (profile_id) do update set
    date_of_birth   = excluded.date_of_birth,
    sex             = excluded.sex,
    phone           = excluded.phone,
    address         = excluded.address,
    emergency_name  = excluded.emergency_name,
    emergency_phone = excluded.emergency_phone,
    allergies       = excluded.allergies,
    updated_at      = now();

  insert into public.departments (name) values ('General Medicine') on conflict (name) do nothing;
  select id into v_dept from public.departments where name = 'General Medicine';

  insert into public.doctors (profile_id, department_id) values (v_doctor, v_dept)
  on conflict (profile_id) do update set department_id = excluded.department_id;
  select id into v_doctor_id from public.doctors where profile_id = v_doctor;

  delete from public.slots where doctor_id = v_doctor_id;

  insert into public.slots (doctor_id, starts_at, ends_at)
  select v_doctor_id, s.t, s.t + interval '30 minutes'
  from (
    select ((d.day + time '09:00' + (k.k * interval '35 minutes')) at time zone c_tz) as t
    from (select (now() at time zone c_tz)::date + n.n as day from generate_series(0, 5) as n(n)) d
    cross join generate_series(0, 5) as k(k)
  ) s
  where s.t > now();

  -- A visit that started 40 minutes ago: the doctor can record its outcome straight away.
  insert into public.slots (doctor_id, starts_at, ends_at, status)
  values (v_doctor_id, now() - interval '40 minutes', now() - interval '10 minutes', 'booked')
  returning id into v_started;
  insert into public.appointments (slot_id, patient_id, visit_reason, visit_note)
  values (v_started, v_patient, 'checkup', 'Demo data: visit in progress');

  select id into v_soon from public.slots
  where doctor_id = v_doctor_id
    and status = 'open'
    and starts_at > now() + interval '1 hour'
    and starts_at < now() + interval '24 hours'
  order by starts_at
  limit 1;

  if v_soon is not null then
    update public.slots set status = 'booked' where id = v_soon;
    insert into public.appointments (slot_id, patient_id, visit_reason, visit_note)
    values (v_soon, v_patient, 'follow_up', 'Demo data');
  end if;

  select id into v_later from public.slots
  where doctor_id = v_doctor_id
    and status = 'open'
    and starts_at > now() + interval '30 hours'
  order by starts_at
  limit 1;

  if v_later is not null then
    update public.slots set status = 'booked' where id = v_later;
    insert into public.appointments (slot_id, patient_id, visit_reason, visit_note)
    values (v_later, v_patient, 'checkup', 'Demo data');
  end if;
end;
$$;
