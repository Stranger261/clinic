-- Patient profiles: a patient must complete one before booking.
-- Clinic time zone 'Asia/Manila' must match lib/clinic.ts.
-- Demo data only: the form tells people not to enter real personal or medical information.

create type patient_sex as enum ('female', 'male', 'other', 'prefer_not_to_say');

-- One row per patient. The full name stays in profiles (it comes from sign-in and can be edited here).
create table patient_profiles (
  profile_id      uuid primary key references profiles (id) on delete cascade,
  date_of_birth   date not null,
  sex             patient_sex not null,
  phone           text not null check (char_length(phone) between 7 and 30),
  address         text not null check (char_length(address) between 5 and 200),
  emergency_name  text not null check (char_length(emergency_name) between 2 and 100),
  emergency_phone text not null check (char_length(emergency_phone) between 7 and 30),
  allergies       text check (char_length(allergies) <= 300),
  updated_at      timestamptz not null default now()
);

-- Deny by default: patients reach their own profile only through the functions below.
alter table patient_profiles enable row level security;

-- Is the signed-in patient's profile complete? (A row exists, which means every required field is filled.)
create function public.patient_profile_complete()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_profiles pp
    join public.profiles p on p.id = pp.profile_id
    where pp.profile_id = (select auth.uid()) and btrim(p.full_name) <> ''
  );
$$;

-- The signed-in user's details, to pre-fill the form (the name is there even before a profile exists).
create function public.get_my_patient_profile()
returns table (
  full_name text,
  date_of_birth date,
  sex public.patient_sex,
  phone text,
  address text,
  emergency_name text,
  emergency_phone text,
  allergies text
)
language sql
security definer
stable
set search_path = ''
as $$
  select p.full_name, pp.date_of_birth, pp.sex, pp.phone, pp.address,
         pp.emergency_name, pp.emergency_phone, pp.allergies
  from public.profiles p
  left join public.patient_profiles pp on pp.profile_id = p.id
  where p.id = (select auth.uid());
$$;

-- Create or update the profile. All the checks are repeated here, because the database is the final authority.
create function public.save_patient_profile(
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

-- ---------- Booking now requires a complete profile ----------
-- Same name and inputs as in 009, so create or replace is enough (the grants stay).
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

-- ---------- The demo patient gets a complete (fake) profile ----------
-- Same as in 010, plus the profile. Visitors can edit it, so the reset puts it back.
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

revoke execute on function public.patient_profile_complete() from public, anon;
revoke execute on function public.get_my_patient_profile() from public, anon;
revoke execute on function public.save_patient_profile(text, date, public.patient_sex, text, text, text, text, text) from public, anon;
grant execute on function public.patient_profile_complete() to authenticated;
grant execute on function public.get_my_patient_profile() to authenticated;
grant execute on function public.save_patient_profile(text, date, public.patient_sex, text, text, text, text, text) to authenticated;
