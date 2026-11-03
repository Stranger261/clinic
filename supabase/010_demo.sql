-- Slice 9: demo mode data. Run this AFTER creating the three demo users
-- in Supabase (Authentication, Users, Add user, with "Auto Confirm User" ticked):
--   demo-patient@clinic.example, demo-doctor@clinic.example, demo-admin@clinic.example
-- Then run:  select public.reset_demo_data();
--
-- Safe to run again at any time. It only touches the three demo accounts,
-- the demo doctor's slots, and the demo patient's appointments.
-- Clinic time zone 'Asia/Manila' must match lib/clinic.ts.

create function public.reset_demo_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_tz       constant text := 'Asia/Manila';
  v_admin    uuid;
  v_doctor   uuid;
  v_patient  uuid;
  v_dept     bigint;
  v_doctor_id bigint;
  v_soon     bigint;
  v_later    bigint;
begin
  select id into v_admin   from public.profiles where email = 'demo-admin@clinic.example';
  select id into v_doctor  from public.profiles where email = 'demo-doctor@clinic.example';
  select id into v_patient from public.profiles where email = 'demo-patient@clinic.example';

  if v_admin is null or v_doctor is null or v_patient is null then
    raise exception 'Create the three demo users in Supabase Authentication first.';
  end if;

  -- Visitors will try to break things. Repair what they could have changed:
  -- the demo admin can promote the demo patient to a doctor, so undo that.
  delete from public.appointments where patient_id = v_patient;
  delete from public.doctors where profile_id = v_patient;

  update public.profiles set full_name = 'Demo Admin',   role = 'admin'   where id = v_admin;
  update public.profiles set full_name = 'Dr. Demo',     role = 'doctor'  where id = v_doctor;
  update public.profiles set full_name = 'Demo Patient', role = 'patient' where id = v_patient;

  insert into public.departments (name) values ('General Medicine') on conflict (name) do nothing;
  select id into v_dept from public.departments where name = 'General Medicine';

  insert into public.doctors (profile_id, department_id) values (v_doctor, v_dept)
  on conflict (profile_id) do update set department_id = excluded.department_id;
  select id into v_doctor_id from public.doctors where profile_id = v_doctor;

  -- Wipe the demo doctor's slots (this also removes their appointments and requests).
  delete from public.slots where doctor_id = v_doctor_id;

  -- Fresh slots for today and the next 5 days: 6 per day, 30 minutes each, 5-minute breaks.
  insert into public.slots (doctor_id, starts_at, ends_at)
  select v_doctor_id, s.t, s.t + interval '30 minutes'
  from (
    select ((d.day + time '09:00' + (k.k * interval '35 minutes')) at time zone c_tz) as t
    from (select (now() at time zone c_tz)::date + n.n as day from generate_series(0, 5) as n(n)) d
    cross join generate_series(0, 5) as k(k)
  ) s
  where s.t > now();

  -- One visit inside the 24-hour window, so the emergency-reschedule flow can be tried at once.
  select id into v_soon from public.slots
  where doctor_id = v_doctor_id
    and starts_at > now() + interval '1 hour'
    and starts_at < now() + interval '24 hours'
  order by starts_at
  limit 1;

  if v_soon is not null then
    update public.slots set status = 'booked' where id = v_soon;
    insert into public.appointments (slot_id, patient_id, visit_reason, visit_note)
    values (v_soon, v_patient, 'follow_up', 'Demo data');
  end if;

  -- One visit more than 24 hours away, so cancelling can be tried.
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

-- Nobody signed in to the app may call this. Run it from the SQL editor or a schedule.
revoke execute on function public.reset_demo_data() from public, anon, authenticated;

-- Optional: reset every day at 03:00 clinic time (19:00 UTC).
-- First enable the "pg_cron" extension in Supabase (Database, Extensions), then run:
--
--   select cron.schedule('reset-demo-data', '0 19 * * *', $$select public.reset_demo_data()$$);
