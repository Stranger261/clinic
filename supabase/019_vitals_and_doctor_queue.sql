-- The visit flow, part 2: the nurse records vitals, the doctor sees who is ready, and a visit can be completed
-- only through the visit flow. This is the "soft gate": a visit needs vitals, or a doctor's reason for going
-- ahead without them. Clinical data is only reachable through these functions, and each honours 2FA.

alter table visits
  add column vitals_skipped_reason text check (char_length(vitals_skipped_reason) between 5 and 300),
  add column vitals_skipped_by     uuid references profiles (id),
  add column started_at            timestamptz,
  add column completed_at          timestamptz;

-- Vitals are append-only: a correction is a new row, and the newest row counts. Nothing edits or deletes them.
create table visit_vitals (
  id            bigint generated always as identity primary key,
  visit_id      bigint not null references visits (id) on delete cascade,
  recorded_by   uuid not null references profiles (id),
  recorded_at   timestamptz not null default now(),
  systolic      integer not null check (systolic between 50 and 260),
  diastolic     integer not null check (diastolic between 30 and 160),
  pulse         integer not null check (pulse between 20 and 250),
  temperature_c numeric(4, 1) not null check (temperature_c between 30 and 45),
  resp_rate     integer not null check (resp_rate between 4 and 80),
  spo2          integer not null check (spo2 between 50 and 100),
  weight_kg     numeric(5, 1) not null check (weight_kg between 1 and 400),
  height_cm     numeric(4, 1) not null check (height_cm between 30 and 250),
  pain_score    integer not null check (pain_score between 0 and 10),
  check (systolic > diastolic)
);
create index visit_vitals_visit_idx on visit_vitals (visit_id, recorded_at desc);
alter table visit_vitals enable row level security;

-- ---------- Nurse: record vitals (and send the patient to the doctor) ----------
create function public.record_vitals(
  p_visit_id    bigint,
  p_systolic    integer,
  p_diastolic   integer,
  p_pulse       integer,
  p_temperature numeric,
  p_resp_rate   integer,
  p_spo2        integer,
  p_weight      numeric,
  p_height      numeric,
  p_pain        integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
begin
  perform public.require_mfa();
  if not public.has_role('nurse') then
    raise exception 'Only nurses can record vitals.';
  end if;

  if p_systolic is null or p_systolic not between 50 and 260 then
    raise exception 'Please check the top blood pressure number (50 to 260).';
  end if;
  if p_diastolic is null or p_diastolic not between 30 and 160 then
    raise exception 'Please check the bottom blood pressure number (30 to 160).';
  end if;
  if p_systolic <= p_diastolic then
    raise exception 'The top blood pressure number must be higher than the bottom one.';
  end if;
  if p_pulse is null or p_pulse not between 20 and 250 then
    raise exception 'Please check the pulse (20 to 250 beats per minute).';
  end if;
  if p_temperature is null or p_temperature not between 30 and 45 then
    raise exception 'Please check the temperature (30 to 45 degrees C).';
  end if;
  if p_resp_rate is null or p_resp_rate not between 4 and 80 then
    raise exception 'Please check the breathing rate (4 to 80 breaths per minute).';
  end if;
  if p_spo2 is null or p_spo2 not between 50 and 100 then
    raise exception 'Please check the oxygen level (50 to 100 percent).';
  end if;
  if p_weight is null or p_weight not between 1 and 400 then
    raise exception 'Please check the weight (1 to 400 kg).';
  end if;
  if p_height is null or p_height not between 30 and 250 then
    raise exception 'Please check the height (30 to 250 cm).';
  end if;
  if p_pain is null or p_pain not between 0 and 10 then
    raise exception 'Please check the pain score (0 to 10).';
  end if;

  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then
    raise exception 'Visit not found.';
  end if;
  if v_visit.stage not in ('checked_in', 'ready') then
    raise exception 'Vitals can only be recorded before the consultation starts.';
  end if;

  insert into public.visit_vitals
    (visit_id, recorded_by, systolic, diastolic, pulse, temperature_c, resp_rate, spo2, weight_kg, height_cm, pain_score)
  values
    (p_visit_id, (select auth.uid()), p_systolic, p_diastolic, p_pulse, p_temperature, p_resp_rate, p_spo2, p_weight, p_height, p_pain);

  if v_visit.stage = 'checked_in' then
    update public.visits set stage = 'ready' where id = p_visit_id;
  end if;
end;
$$;

-- The nurse's list now also shows patients already sent on (so a mistake can be corrected before the doctor starts).
drop function public.nurse_queue();

create function public.nurse_queue()
returns table (
  visit_id bigint,
  appointment_id bigint,
  slot_start timestamptz,
  doctor_name text,
  patient_name text,
  patient_no bigint,
  patient_age integer,
  patient_sex public.patient_sex,
  allergies text,
  visit_reason public.visit_reason,
  visit_note text,
  checked_in_at timestamptz,
  stage public.visit_stage,
  vitals_recorded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_mfa();
  if not public.has_role('nurse') then
    raise exception 'Only nurses can view this.';
  end if;

  return query
  select v.id, a.id, s.starts_at, dr.full_name,
         pr.full_name, pp.patient_no,
         case when pp.profile_id is null then null
              else date_part('year', age((now() at time zone 'Asia/Manila')::date, pp.date_of_birth))::integer end,
         pp.sex, pp.allergies, a.visit_reason, a.visit_note, v.checked_in_at,
         v.stage, lv.recorded_at
  from public.visits v
  join public.appointments a on a.id = v.appointment_id
  join public.slots s on s.id = a.slot_id
  join public.doctors d on d.id = s.doctor_id
  join public.profiles dr on dr.id = d.profile_id
  join public.profiles pr on pr.id = a.patient_id
  left join public.patient_profiles pp on pp.profile_id = a.patient_id
  left join lateral (
    select vv.recorded_at from public.visit_vitals vv
    where vv.visit_id = v.id order by vv.recorded_at desc, vv.id desc limit 1
  ) lv on true
  where v.stage in ('checked_in', 'ready')
    and a.status = 'confirmed'
    and a.outcome is null
  order by (v.stage = 'checked_in') desc, v.checked_in_at;
end;
$$;

-- ---------- Doctor: who is here, with the vitals ----------
create function public.doctor_queue()
returns table (
  visit_id bigint,
  appointment_id bigint,
  slot_start timestamptz,
  slot_end timestamptz,
  stage public.visit_stage,
  patient_name text,
  patient_no bigint,
  patient_age integer,
  patient_sex public.patient_sex,
  patient_phone text,
  allergies text,
  visit_reason public.visit_reason,
  visit_note text,
  checked_in_at timestamptz,
  skipped_reason text,
  vitals_recorded_at timestamptz,
  systolic integer,
  diastolic integer,
  pulse integer,
  temperature_c numeric,
  resp_rate integer,
  spo2 integer,
  weight_kg numeric,
  height_cm numeric,
  bmi numeric,
  pain_score integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor bigint := public.my_doctor_id();
begin
  perform public.require_mfa();
  if v_doctor is null then
    raise exception 'Only doctors can view this.';
  end if;

  return query
  select v.id, a.id, s.starts_at, s.ends_at, v.stage,
         pr.full_name, pp.patient_no,
         case when pp.profile_id is null then null
              else date_part('year', age((now() at time zone 'Asia/Manila')::date, pp.date_of_birth))::integer end,
         pp.sex, pp.phone, pp.allergies, a.visit_reason, a.visit_note, v.checked_in_at,
         v.vitals_skipped_reason, lv.recorded_at,
         lv.systolic, lv.diastolic, lv.pulse, lv.temperature_c, lv.resp_rate, lv.spo2, lv.weight_kg, lv.height_cm,
         case when lv.height_cm is null then null
              else round(lv.weight_kg / ((lv.height_cm / 100.0) ^ 2), 1) end,
         lv.pain_score
  from public.visits v
  join public.appointments a on a.id = v.appointment_id
  join public.slots s on s.id = a.slot_id
  join public.profiles pr on pr.id = a.patient_id
  left join public.patient_profiles pp on pp.profile_id = a.patient_id
  left join lateral (
    select * from public.visit_vitals vv
    where vv.visit_id = v.id order by vv.recorded_at desc, vv.id desc limit 1
  ) lv on true
  where s.doctor_id = v_doctor
    and v.stage in ('checked_in', 'ready', 'in_consultation')
    and a.status = 'confirmed'
    and a.outcome is null
  order by (v.stage = 'in_consultation') desc, (v.stage = 'ready') desc, v.checked_in_at;
end;
$$;

-- Doctor: go ahead without vitals, with a reason (the soft gate). The reason is saved with the visit.
create function public.skip_vitals(p_visit_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor bigint := public.my_doctor_id();
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_mfa();
  if v_doctor is null then
    raise exception 'Only doctors can do this.';
  end if;
  if char_length(v_reason) not between 5 and 300 then
    raise exception 'Please give a reason (5 to 300 characters).';
  end if;

  update public.visits v
  set vitals_skipped_reason = v_reason, vitals_skipped_by = (select auth.uid()), stage = 'ready'
  from public.appointments a, public.slots s
  where v.id = p_visit_id and a.id = v.appointment_id and s.id = a.slot_id
    and s.doctor_id = v_doctor and v.stage = 'checked_in';
  if not found then
    raise exception 'That visit was not found, is not waiting for vitals, or is not yours.';
  end if;
end;
$$;

-- Doctor: start the consultation. The visit must have vitals, or the doctor's reason for going ahead without them.
create function public.start_consultation(p_visit_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor bigint := public.my_doctor_id();
begin
  perform public.require_mfa();
  if v_doctor is null then
    raise exception 'Only doctors can do this.';
  end if;

  update public.visits v
  set stage = 'in_consultation', started_at = now()
  from public.appointments a, public.slots s
  where v.id = p_visit_id and a.id = v.appointment_id and s.id = a.slot_id
    and s.doctor_id = v_doctor and v.stage = 'ready'
    and (v.vitals_skipped_reason is not null or exists (select 1 from public.visit_vitals vv where vv.visit_id = v.id));
  if not found then
    raise exception 'That visit is not ready: it needs vitals, or a reason for going ahead without them.';
  end if;
end;
$$;

-- Doctor: complete the visit. This is the only way a visit becomes Completed.
create function public.complete_visit(p_visit_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor bigint := public.my_doctor_id();
  v_appt   bigint;
begin
  perform public.require_mfa();
  if v_doctor is null then
    raise exception 'Only doctors can do this.';
  end if;

  update public.visits v
  set stage = 'completed', completed_at = now()
  from public.appointments a, public.slots s
  where v.id = p_visit_id and a.id = v.appointment_id and s.id = a.slot_id
    and s.doctor_id = v_doctor and v.stage = 'in_consultation'
    and (v.vitals_skipped_reason is not null or exists (select 1 from public.visit_vitals vv where vv.visit_id = v.id))
  returning v.appointment_id into v_appt;
  if not found then
    raise exception 'A visit can be completed once the consultation has started, and only with vitals or a reason for going without them.';
  end if;

  update public.appointments set outcome = 'completed', outcome_at = now() where id = v_appt;
end;
$$;

-- "Completed" now comes only from complete_visit. This function still records a no-show,
-- but not for a patient who has arrived. (Same name and inputs as in 014, so create or replace is enough.)
create or replace function public.set_visit_outcome(p_slot_id bigint, p_outcome public.visit_outcome)
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

  if p_outcome = 'completed' then
    raise exception 'A visit is completed from Patients today: start the consultation, then complete the visit.';
  end if;

  if exists (
    select 1 from public.visits v join public.appointments a on a.id = v.appointment_id
    where a.slot_id = p_slot_id and a.status = 'confirmed'
  ) then
    raise exception 'This patient has arrived, so the visit cannot be marked as a no-show.';
  end if;

  update public.appointments
  set outcome = p_outcome, outcome_at = now()
  where slot_id = p_slot_id and status = 'confirmed';
  if not found then
    raise exception 'There is no booked visit on this slot.';
  end if;
end;
$$;

revoke execute on function public.record_vitals(bigint, integer, integer, integer, numeric, integer, integer, numeric, numeric, integer) from public, anon;
revoke execute on function public.nurse_queue() from public, anon;
revoke execute on function public.doctor_queue() from public, anon;
revoke execute on function public.skip_vitals(bigint, text) from public, anon;
revoke execute on function public.start_consultation(bigint) from public, anon;
revoke execute on function public.complete_visit(bigint) from public, anon;
grant execute on function public.record_vitals(bigint, integer, integer, integer, numeric, integer, integer, numeric, numeric, integer) to authenticated;
grant execute on function public.nurse_queue() to authenticated;
grant execute on function public.doctor_queue() to authenticated;
grant execute on function public.skip_vitals(bigint, text) to authenticated;
grant execute on function public.start_consultation(bigint) to authenticated;
grant execute on function public.complete_visit(bigint) to authenticated;
