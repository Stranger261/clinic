-- Slice 4: doctors add slots, see their schedule, and extend a visit.
-- Keep these constants in sync with lib/clinic.ts:
--   clinic time zone 'Asia/Manila', slot length 30 minutes, break 5 minutes.

-- 1. Which doctors row belongs to the signed-in user (null if they are not a doctor)?
create function public.my_doctor_id()
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select id from public.doctors where profile_id = (select auth.uid());
$$;

-- 2. Doctors can read and delete their own slots. A booked slot cannot be deleted.
--    There is NO insert or update policy: changes go through the functions below,
--    so nobody can create a slot with a custom length or change a status directly.
create policy "Doctors can read their own slots"
  on slots for select to authenticated
  using (doctor_id = public.my_doctor_id());

create policy "Doctors can delete their own unbooked slots"
  on slots for delete to authenticated
  using (doctor_id = public.my_doctor_id() and status <> 'booked');

-- 3. Add one 30-minute slot. The doctor sends a clinic-local date and time;
--    Postgres converts it to a real instant (handles daylight saving correctly).
create function public.add_slot(p_local_start timestamp)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_tz     constant text := 'Asia/Manila';
  c_length constant interval := interval '30 minutes';
  c_break  constant interval := interval '5 minutes';
  v_doctor bigint := public.my_doctor_id();
  v_start  timestamptz;
  v_end    timestamptz;
begin
  if v_doctor is null then
    raise exception 'Only doctors can add slots.';
  end if;

  v_start := p_local_start at time zone c_tz;
  v_end := v_start + c_length;

  if v_start < now() then
    raise exception 'Slots must start in the future.';
  end if;

  -- Soft rule: keep a break between slots. (The hard no-overlap rule is the
  -- slots_no_overlap constraint, which still applies underneath.)
  if exists (
    select 1 from public.slots
    where doctor_id = v_doctor
      and starts_at < v_end + c_break
      and ends_at + c_break > v_start
  ) then
    raise exception 'That time is too close to another slot. Keep a 5-minute break between slots.';
  end if;

  insert into public.slots (doctor_id, starts_at, ends_at)
  values (v_doctor, v_start, v_end);
end;
$$;

-- 4. Extend a booked visit by taking over the slot right after it, if still open.
create function public.extend_slot(p_slot_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_break  constant interval := interval '5 minutes';
  v_doctor bigint := public.my_doctor_id();
  v_slot   public.slots%rowtype;
  v_next   bigint;
begin
  if v_doctor is null then
    raise exception 'Only doctors can do this.';
  end if;

  select * into v_slot from public.slots where id = p_slot_id and doctor_id = v_doctor;
  if not found then
    raise exception 'Slot not found.';
  end if;

  if v_slot.status <> 'booked' then
    raise exception 'Only a booked visit can be extended.';
  end if;

  -- The slot that starts right after this one (within the break).
  select id into v_next from public.slots
  where doctor_id = v_doctor
    and starts_at >= v_slot.ends_at
    and starts_at <= v_slot.ends_at + c_break
  order by starts_at
  limit 1;

  if v_next is null then
    raise exception 'The time after this visit is already free. No slot needs to be taken over.';
  end if;

  -- Check and change in ONE statement. If a patient books that slot at the same
  -- moment, only one of the two wins, and nobody is double-booked.
  update public.slots set status = 'blocked'
  where id = v_next and status = 'open';

  if not found then
    raise exception 'The next slot is already booked or blocked, so this visit cannot be extended.';
  end if;
end;
$$;

revoke execute on function public.add_slot(timestamp) from public, anon;
revoke execute on function public.extend_slot(bigint) from public, anon;
grant execute on function public.add_slot(timestamp) to authenticated;
grant execute on function public.extend_slot(bigint) to authenticated;
