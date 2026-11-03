-- Slice 6b, step 2 of 2: emergency reschedule requests with a held slot.
-- Run AFTER 007a. Keep 24 hours in sync with lib/clinic.ts.

create type request_status as enum ('pending', 'approved', 'denied', 'withdrawn', 'expired');

create table reschedule_requests (
  id             bigint generated always as identity primary key,
  appointment_id bigint not null references appointments (id) on delete cascade,
  old_slot_id    bigint not null references slots (id) on delete cascade,
  new_slot_id    bigint not null references slots (id) on delete cascade,
  reason         text not null check (char_length(reason) between 10 and 500),
  status         request_status not null default 'pending',
  decided_by     uuid references profiles (id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now()
);

-- Safety nets: one pending request per appointment, and per held slot.
create unique index reschedule_one_pending_per_appointment
  on reschedule_requests (appointment_id) where status = 'pending';
create unique index reschedule_one_pending_per_new_slot
  on reschedule_requests (new_slot_id) where status = 'pending';

alter table reschedule_requests enable row level security;

-- A held slot must not be deletable by the doctor.
drop policy "Doctors can delete their own unbooked slots" on slots;
create policy "Doctors can delete their own open or blocked slots"
  on slots for delete to authenticated
  using (doctor_id = public.my_doctor_id() and status in ('open', 'blocked'));

-- ---------- Helpers ----------

-- May the caller decide a request about this (old) slot? Admins, or that slot's doctor.
-- Written with exists() so "unknown" always means "no" (never a NULL).
create function public.can_decide(p_old_slot_id bigint)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_admin()
      or exists (
        select 1 from public.slots s
        where s.id = p_old_slot_id and s.doctor_id = public.my_doctor_id()
      );
$$;

-- Lazy cleanup, no scheduled job: any pending request whose visit has already
-- started expires, and the slot it was holding goes back to open.
create function public.expire_stale_requests()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with stale as (
    update public.reschedule_requests r
    set status = 'expired', decided_at = now()
    from public.slots s
    where r.status = 'pending' and s.id = r.old_slot_id and s.starts_at <= now()
    returning r.new_slot_id
  )
  update public.slots set status = 'open'
  where id in (select new_slot_id from stale) and status = 'held';
end;
$$;

-- ---------- Patient actions ----------

create function public.request_reschedule(p_appointment_id bigint, p_new_slot_id bigint, p_reason text)
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

create function public.withdraw_reschedule(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.reschedule_requests%rowtype;
begin
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

-- Slots with the SAME doctor that the patient could move to.
create function public.open_slots_for_reschedule(p_appointment_id bigint)
returns table (slot_id bigint, slot_start timestamptz, slot_end timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_stale_requests();
  return query
  select s.id, s.starts_at, s.ends_at
  from public.appointments a
  join public.slots cur on cur.id = a.slot_id
  join public.slots s on s.doctor_id = cur.doctor_id
  where a.id = p_appointment_id
    and a.patient_id = (select auth.uid())
    and a.status = 'confirmed'
    and s.status = 'open'
    and s.starts_at > now()
  order by s.starts_at
  limit 40;
end;
$$;

-- ---------- Staff actions (the slot's doctor, or an admin) ----------

create function public.approve_reschedule(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.reschedule_requests%rowtype;
begin
  perform public.expire_stale_requests();

  select * into v_req from public.reschedule_requests where id = p_request_id for update;
  if not found or not public.can_decide(v_req.old_slot_id) then
    raise exception 'Request not found.';
  end if;
  if v_req.status = 'expired' then
    raise exception 'This request expired because the appointment already started.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided.';
  end if;

  -- Move the appointment onto the held slot, then release the old one.
  update public.appointments set slot_id = v_req.new_slot_id
  where id = v_req.appointment_id and status = 'confirmed';
  if not found then
    raise exception 'The appointment is no longer active.';
  end if;

  update public.slots set status = 'booked' where id = v_req.new_slot_id and status = 'held';
  if not found then
    raise exception 'The held slot is no longer available.';
  end if;

  update public.slots set status = 'open' where id = v_req.old_slot_id and status = 'booked';

  update public.reschedule_requests
  set status = 'approved', decided_by = (select auth.uid()), decided_at = now()
  where id = v_req.id;
end;
$$;

create function public.deny_reschedule(p_request_id bigint, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.reschedule_requests%rowtype;
begin
  perform public.expire_stale_requests();

  select * into v_req from public.reschedule_requests where id = p_request_id for update;
  if not found or not public.can_decide(v_req.old_slot_id) then
    raise exception 'Request not found.';
  end if;
  if v_req.status = 'expired' then
    raise exception 'This request expired because the appointment already started.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided.';
  end if;

  update public.reschedule_requests
  set status = 'denied',
      decided_by = (select auth.uid()),
      decided_at = now(),
      decision_note = nullif(left(btrim(coalesce(p_note, '')), 300), '')
  where id = v_req.id;

  update public.slots set status = 'open' where id = v_req.new_slot_id and status = 'held';
end;
$$;

create function public.pending_reschedule_requests()
returns table (
  request_id bigint,
  patient_name text,
  doctor_name text,
  old_start timestamptz,
  old_end timestamptz,
  new_start timestamptz,
  new_end timestamptz,
  reason_text text,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_stale_requests();
  return query
  select r.id, pp.full_name, dp.full_name, os.starts_at, os.ends_at,
         ns.starts_at, ns.ends_at, r.reason, r.created_at
  from public.reschedule_requests r
  join public.appointments a on a.id = r.appointment_id
  join public.profiles pp on pp.id = a.patient_id
  join public.slots os on os.id = r.old_slot_id
  join public.slots ns on ns.id = r.new_slot_id
  join public.doctors d on d.id = os.doctor_id
  join public.profiles dp on dp.id = d.profile_id
  where r.status = 'pending' and public.can_decide(r.old_slot_id)
  order by os.starts_at;
end;
$$;

-- ---------- Replace two earlier functions so they also clean up and show requests ----------

create or replace function public.search_open_slots(p_date date, p_department_id bigint default null)
returns table (
  slot_id bigint,
  slot_start timestamptz,
  slot_end timestamptz,
  doctor_id bigint,
  doctor_name text,
  department_id bigint,
  department_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_stale_requests();
  return query
  select s.id, s.starts_at, s.ends_at, d.id, p.full_name, dep.id, dep.name
  from public.slots s
  join public.doctors d on d.id = s.doctor_id
  join public.profiles p on p.id = d.profile_id
  join public.departments dep on dep.id = d.department_id
  where s.status = 'open'
    and s.starts_at > now()
    and s.starts_at >= (p_date::timestamp at time zone 'Asia/Manila')
    and s.starts_at <  ((p_date + 1)::timestamp at time zone 'Asia/Manila')
    and (p_department_id is null or d.department_id = p_department_id)
  order by s.starts_at, p.full_name;
end;
$$;

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
  request_note text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_stale_requests();
  return query
  select a.id, a.status, s.starts_at, s.ends_at, p.full_name, dep.name,
         r.id, r.status, ns.starts_at, r.decision_note
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
revoke execute on function public.can_decide(bigint) from public, anon, authenticated;
revoke execute on function public.expire_stale_requests() from public, anon, authenticated;

revoke execute on function public.request_reschedule(bigint, bigint, text) from public, anon;
revoke execute on function public.withdraw_reschedule(bigint) from public, anon;
revoke execute on function public.open_slots_for_reschedule(bigint) from public, anon;
revoke execute on function public.approve_reschedule(bigint) from public, anon;
revoke execute on function public.deny_reschedule(bigint, text) from public, anon;
revoke execute on function public.pending_reschedule_requests() from public, anon;
revoke execute on function public.my_appointments() from public, anon;
revoke execute on function public.search_open_slots(date, bigint) from public, anon;

grant execute on function public.request_reschedule(bigint, bigint, text) to authenticated;
grant execute on function public.withdraw_reschedule(bigint) to authenticated;
grant execute on function public.open_slots_for_reschedule(bigint) to authenticated;
grant execute on function public.approve_reschedule(bigint) to authenticated;
grant execute on function public.deny_reschedule(bigint, text) to authenticated;
grant execute on function public.pending_reschedule_requests() to authenticated;
grant execute on function public.my_appointments() to authenticated;
grant execute on function public.search_open_slots(date, bigint) to authenticated;
