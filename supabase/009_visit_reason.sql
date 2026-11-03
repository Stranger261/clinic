-- Slice 8: reason for visit (a choice from a list plus an optional short note).
-- Keep the list and the 150-character limit in sync with lib/clinic.ts.

create type visit_reason as enum ('checkup', 'follow_up', 'new_concern', 'other');

-- Stored on the appointment, so it follows the patient through reschedules.
-- Appointments made before this change become 'other'.
alter table appointments
  add column visit_reason public.visit_reason not null default 'other',
  add column visit_note text check (char_length(visit_note) <= 150);

-- ---------- Booking now requires a reason ----------
-- Drop the OLD version. If it stayed, it would remain callable next to the new one
-- (Postgres allows both), and anyone could skip the reason by calling the old one.
drop function public.book_slot(bigint);

create function public.book_slot(
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

-- ---------- One open slot's details, for the confirmation step ----------
create function public.open_slot_details(p_slot_id bigint)
returns table (slot_start timestamptz, slot_end timestamptz, doctor_name text, department_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_stale_requests();
  return query
  select s.starts_at, s.ends_at, p.full_name, dep.name
  from public.slots s
  join public.doctors d on d.id = s.doctor_id
  join public.profiles p on p.id = d.profile_id
  join public.departments dep on dep.id = d.department_id
  where s.id = p_slot_id and s.status = 'open' and s.starts_at > now();
end;
$$;

-- ---------- Doctor schedule: add the reason ----------
-- (A function's return columns cannot change with "create or replace", so drop and recreate.)
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
  visit_note text
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
    coalesce(ba.visit_note, ha.visit_note)
  from public.slots s
  left join public.appointments ba on ba.slot_id = s.id and ba.status = 'confirmed'
  left join public.profiles bp on bp.id = ba.patient_id
  left join public.reschedule_requests hr on hr.new_slot_id = s.id and hr.status = 'pending'
  left join public.appointments ha on ha.id = hr.appointment_id
  left join public.profiles hp on hp.id = ha.patient_id
  where s.doctor_id = v_doctor
    and s.ends_at >= now()
  order by s.starts_at;
end;
$$;

-- ---------- Patient appointments: add the reason ----------
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
  visit_note text
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
         a.visit_reason, a.visit_note
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

-- ---------- Who may call what ----------
revoke execute on function public.book_slot(bigint, public.visit_reason, text) from public, anon;
revoke execute on function public.open_slot_details(bigint) from public, anon;
revoke execute on function public.my_schedule() from public, anon;
revoke execute on function public.my_appointments() from public, anon;

grant execute on function public.book_slot(bigint, public.visit_reason, text) to authenticated;
grant execute on function public.open_slot_details(bigint) to authenticated;
grant execute on function public.my_schedule() to authenticated;
grant execute on function public.my_appointments() to authenticated;
