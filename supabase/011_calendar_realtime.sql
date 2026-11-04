-- Slice 10: calendar views with live updates.
-- Clinic time zone 'Asia/Manila' must match lib/clinic.ts.

-- 1. Turn on Realtime for the slots table (safe to run twice).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'slots'
  ) then
    alter publication supabase_realtime add table public.slots;
  end if;
end
$$;

-- 2. Realtime only delivers changes for rows the signed-in user is allowed to SELECT.
--    A calendar that shows taken slots needs this visibility. It exposes slot times,
--    the doctor and the status only. Who booked a slot stays hidden (appointments is still locked).
create policy "Signed-in users can see slot times and status"
  on slots for select to authenticated
  using (true);

-- 3. Doctors with their department, for the doctor picker (patients cannot read profiles).
create function public.list_doctors()
returns table (doctor_id bigint, doctor_name text, department_id bigint, department_name text)
language sql
security definer
stable
set search_path = ''
as $$
  select d.id, p.full_name, dep.id, dep.name
  from public.doctors d
  join public.profiles p on p.id = d.profile_id
  join public.departments dep on dep.id = d.department_id
  order by dep.name, p.full_name;
$$;

-- 4. One doctor's slots for a stretch of days that starts on a clinic-local date.
--    It also releases holds of expired reschedule requests, so the calendar is never stale.
create function public.calendar_slots(p_doctor_id bigint, p_from date, p_days integer default 7)
returns table (slot_id bigint, slot_start timestamptz, slot_end timestamptz, slot_status public.slot_status)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_stale_requests();
  return query
  select s.id, s.starts_at, s.ends_at, s.status
  from public.slots s
  where s.doctor_id = p_doctor_id
    and s.starts_at > now()
    and s.starts_at >= (p_from::timestamp at time zone 'Asia/Manila')
    and s.starts_at <  ((p_from + least(greatest(p_days, 1), 14))::timestamp at time zone 'Asia/Manila')
  order by s.starts_at;
end;
$$;

revoke execute on function public.list_doctors() from public, anon;
revoke execute on function public.calendar_slots(bigint, date, integer) from public, anon;
grant execute on function public.list_doctors() to authenticated;
grant execute on function public.calendar_slots(bigint, date, integer) to authenticated;