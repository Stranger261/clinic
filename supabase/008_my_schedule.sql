-- Slice 7: a doctor sees which patient is on each of their slots.
-- Doctors cannot read the profiles table, so this function is the controlled gateway:
-- it returns only the patient's NAME, and only for the signed-in doctor's own slots.

create function public.my_schedule()
returns table (
  slot_id bigint,
  slot_start timestamptz,
  slot_end timestamptz,
  slot_status public.slot_status,
  patient_name text,
  reschedule_pending boolean
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
    -- Booked slot: the patient who booked it. Held slot: the patient asking to move here.
    coalesce(bp.full_name, hp.full_name),
    -- Has the patient on this booked slot asked to reschedule?
    exists (
      select 1
      from public.reschedule_requests rr
      join public.appointments ra on ra.id = rr.appointment_id
      where rr.status = 'pending' and ra.slot_id = s.id
    )
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

revoke execute on function public.my_schedule() from public, anon;
grant execute on function public.my_schedule() to authenticated;
