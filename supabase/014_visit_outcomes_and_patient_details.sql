-- Doctors can record how a visit went (completed or no-show), and see the details of the patient on
-- each booked slot. Clinic time zone 'Asia/Manila' must match lib/clinic.ts.
-- Doctors do NOT get the patient's address or exact date of birth, only what they need for the visit.

create type visit_outcome as enum ('completed', 'no_show');

-- The appointment stays 'confirmed'. The outcome is recorded next to it, and can be corrected later.
alter table appointments
  add column outcome    visit_outcome,
  add column outcome_at timestamptz;

-- Record the outcome of a visit. Only the slot's own doctor, and only once the visit has started.
create function public.set_visit_outcome(p_slot_id bigint, p_outcome public.visit_outcome)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor bigint := public.my_doctor_id();
  v_slot   public.slots%rowtype;
begin
  if v_doctor is null then
    raise exception 'Only doctors can do this.';
  end if;
  if p_outcome is null then
    raise exception 'Please choose an outcome.';
  end if;

  select * into v_slot from public.slots where id = p_slot_id and doctor_id = v_doctor;
  if not found then
    raise exception 'Slot not found.';
  end if;

  if v_slot.starts_at > now() then
    raise exception 'You can record the outcome once the visit has started.';
  end if;

  update public.appointments
  set outcome = p_outcome, outcome_at = now()
  where slot_id = p_slot_id and status = 'confirmed';
  if not found then
    raise exception 'There is no booked visit on this slot.';
  end if;
end;
$$;

-- The doctor's schedule, now with the outcome and the patient details the doctor needs.
-- It also reaches back 30 days, so a visit that has just ended can still be closed.
-- (The return columns changed, so drop and recreate.)
drop function public.my_schedule();

create function public.my_schedule()
returns table (
  slot_id bigint,
  slot_start timestamptz,
  slot_end timestamptz,
  slot_status public.slot_status,
  patient_name text,
  reschedule_pending boolean,
  visit_reason public.visit_reason,
  visit_note text,
  outcome public.visit_outcome,
  patient_age integer,
  patient_sex public.patient_sex,
  patient_phone text,
  emergency_name text,
  emergency_phone text,
  allergies text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor bigint := public.my_doctor_id();
begin
  if v_doctor is null then
    raise exception 'Only doctors can view a schedule.';
  end if;

  perform public.expire_stale_requests();

  return query
  select
    s.id,
    s.starts_at,
    s.ends_at,
    s.status,
    coalesce(bp.full_name, hp.full_name),
    exists (
      select 1
      from public.reschedule_requests rr
      join public.appointments ra on ra.id = rr.appointment_id
      where rr.status = 'pending' and ra.slot_id = s.id
    ),
    coalesce(ba.visit_reason, ha.visit_reason),
    coalesce(ba.visit_note, ha.visit_note),
    ba.outcome,
    case when pp.profile_id is null then null
         else date_part('year', age((now() at time zone 'Asia/Manila')::date, pp.date_of_birth))::integer end,
    pp.sex,
    pp.phone,
    pp.emergency_name,
    pp.emergency_phone,
    pp.allergies
  from public.slots s
  left join public.appointments ba on ba.slot_id = s.id and ba.status = 'confirmed'
  left join public.profiles bp on bp.id = ba.patient_id
  left join public.patient_profiles pp on pp.profile_id = ba.patient_id
  left join public.reschedule_requests hr on hr.new_slot_id = s.id and hr.status = 'pending'
  left join public.appointments ha on ha.id = hr.appointment_id
  left join public.profiles hp on hp.id = ha.patient_id
  where s.doctor_id = v_doctor
    and s.starts_at >= now() - interval '30 days'
  order by s.starts_at;
end;
$$;

-- The patient's own list, now with the outcome (so a past visit can show Completed or No-show).
drop function public.my_appointments();

create function public.my_appointments()
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

-- The demo gets one visit that has just started, so "Completed" and "No-show" can be tried at once.
-- (Same as in 013, plus that block.)
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

revoke execute on function public.set_visit_outcome(bigint, public.visit_outcome) from public, anon;
revoke execute on function public.my_schedule() from public, anon;
revoke execute on function public.my_appointments() from public, anon;
grant execute on function public.set_visit_outcome(bigint, public.visit_outcome) to authenticated;
grant execute on function public.my_schedule() to authenticated;
grant execute on function public.my_appointments() to authenticated;
