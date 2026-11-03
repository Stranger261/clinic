-- Slice 6a: patients can cancel an appointment up to 24 hours before it starts.
-- Keep the 24 hours in sync with CANCEL_NOTICE_HOURS in lib/clinic.ts.

create function public.cancel_appointment(p_appointment_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_notice  constant interval := interval '24 hours';
  v_patient uuid := (select auth.uid());
  v_appt    public.appointments%rowtype;
  v_start   timestamptz;
begin
  if v_patient is null then
    raise exception 'Please sign in.';
  end if;

  -- "for update" locks this row, so two cancel clicks at the same moment
  -- run one after the other instead of both passing the checks below.
  select * into v_appt
  from public.appointments
  where id = p_appointment_id and patient_id = v_patient
  for update;

  if not found then
    raise exception 'Appointment not found.';
  end if;

  if v_appt.status <> 'confirmed' then
    raise exception 'This appointment is already cancelled.';
  end if;

  select starts_at into v_start from public.slots where id = v_appt.slot_id;

  if v_start - now() < c_notice then
    raise exception 'Appointments can only be cancelled at least 24 hours before they start.';
  end if;

  -- Both changes happen together: cancel it AND give the slot back.
  update public.appointments set status = 'cancelled' where id = v_appt.id;
  update public.slots set status = 'open' where id = v_appt.slot_id and status = 'booked';
end;
$$;

revoke execute on function public.cancel_appointment(bigint) from public, anon;
grant execute on function public.cancel_appointment(bigint) to authenticated;
