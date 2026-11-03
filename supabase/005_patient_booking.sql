-- Slice 5: patients search open slots, book one, and see their appointments.
-- Clinic time zone 'Asia/Manila' must match lib/clinic.ts.

-- 1. Appointments: who booked which slot.
create type appointment_status as enum ('confirmed', 'cancelled');

create table appointments (
  id         bigint generated always as identity primary key,
  slot_id    bigint not null references slots (id) on delete cascade,
  patient_id uuid not null references profiles (id) on delete cascade,
  status     appointment_status not null default 'confirmed',
  created_at timestamptz not null default now()
);

-- Safety net: a slot can have at most ONE confirmed appointment, whatever the app does.
create unique index appointments_one_confirmed_per_slot
  on appointments (slot_id) where status = 'confirmed';
create index appointments_patient_idx on appointments (patient_id);

-- Deny by default. Patients reach appointments only through the functions below.
alter table appointments enable row level security;

-- 2. Search open slots on a clinic-local date, optionally for one department.
--    This returns only what patients may see (doctor NAME, not email or anything else).
create function public.search_open_slots(p_date date, p_department_id bigint default null)
returns table (
  slot_id bigint,
  slot_start timestamptz,
  slot_end timestamptz,
  doctor_id bigint,
  doctor_name text,
  department_id bigint,
  department_name text
)
language sql
security definer
stable
set search_path = ''
as $$
  select s.id, s.starts_at, s.ends_at, d.id, p.full_name, dep.id, dep.name
  from public.slots s
  join public.doctors d on d.id = s.doctor_id
  join public.profiles p on p.id = d.profile_id
  join public.departments dep on dep.id = d.department_id
  where s.status = 'open'
    and s.starts_at > now()
    -- A "day" is a range in the clinic's time zone: midnight to the next midnight.
    and s.starts_at >= (p_date::timestamp at time zone 'Asia/Manila')
    and s.starts_at <  ((p_date + 1)::timestamp at time zone 'Asia/Manila')
    and (p_department_id is null or d.department_id = p_department_id)
  order by s.starts_at, p.full_name;
$$;

-- 3. Book a slot. Everything below succeeds together or not at all.
create function public.book_slot(p_slot_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid := (select auth.uid());
begin
  if v_patient is null then
    raise exception 'Please sign in to book.';
  end if;

  if not exists (select 1 from public.profiles where id = v_patient and role = 'patient') then
    raise exception 'Only patients can book appointments.';
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

  insert into public.appointments (slot_id, patient_id) values (p_slot_id, v_patient);
end;
$$;

-- 4. The signed-in patient's own appointments, with doctor and department names.
create function public.my_appointments()
returns table (
  appointment_id bigint,
  status public.appointment_status,
  slot_start timestamptz,
  slot_end timestamptz,
  doctor_name text,
  department_name text
)
language sql
security definer
stable
set search_path = ''
as $$
  select a.id, a.status, s.starts_at, s.ends_at, p.full_name, dep.name
  from public.appointments a
  join public.slots s on s.id = a.slot_id
  join public.doctors d on d.id = s.doctor_id
  join public.profiles p on p.id = d.profile_id
  join public.departments dep on dep.id = d.department_id
  where a.patient_id = (select auth.uid())
  order by s.starts_at desc;
$$;

revoke execute on function public.search_open_slots(date, bigint) from public, anon;
revoke execute on function public.book_slot(bigint) from public, anon;
revoke execute on function public.my_appointments() from public, anon;
grant execute on function public.search_open_slots(date, bigint) to authenticated;
grant execute on function public.book_slot(bigint) to authenticated;
grant execute on function public.my_appointments() to authenticated;
