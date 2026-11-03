-- Slice 3: admins manage departments and doctors.

-- 1. Store each user's email so an admin can tell two "Dr. Smith"s apart.
alter table profiles add column email text;
update profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email);
  return new;
end;
$$;

-- 2. Helper used by policies and functions: is the caller an admin?
create function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- 3. Row-level security policies
create policy "Admins can read all profiles"
  on profiles for select to authenticated
  using (public.is_admin());

create policy "Signed-in users can read departments"
  on departments for select to authenticated
  using (true);

create policy "Admins can add departments"
  on departments for insert to authenticated
  with check (public.is_admin());

create policy "Admins can rename departments"
  on departments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins can delete departments"
  on departments for delete to authenticated
  using (public.is_admin());

create policy "Signed-in users can read doctors"
  on doctors for select to authenticated
  using (true);
-- No insert/update/delete policies on doctors: changes go through the functions below.

-- 4. Make a patient a doctor. Both steps succeed together or not at all.
create function public.assign_doctor(p_profile_id uuid, p_department_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this.';
  end if;

  update public.profiles set role = 'doctor'
  where id = p_profile_id and role = 'patient';
  if not found then
    raise exception 'That user was not found or is not a patient.';
  end if;

  insert into public.doctors (profile_id, department_id)
  values (p_profile_id, p_department_id);
end;
$$;

-- 5. Remove a doctor, unless they still have booked slots.
create function public.remove_doctor(p_doctor_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this.';
  end if;

  if exists (select 1 from public.slots where doctor_id = p_doctor_id and status = 'booked') then
    raise exception 'This doctor has booked slots. Cancel them first.';
  end if;

  delete from public.doctors where id = p_doctor_id returning profile_id into v_profile;
  if v_profile is null then
    raise exception 'Doctor not found.';
  end if;

  update public.profiles set role = 'patient' where id = v_profile;
end;
$$;

-- 6. Only signed-in users may call these (they still check is_admin inside).
revoke execute on function public.assign_doctor(uuid, bigint) from public, anon;
revoke execute on function public.remove_doctor(bigint) from public, anon;
grant execute on function public.assign_doctor(uuid, bigint) to authenticated;
grant execute on function public.remove_doctor(bigint) to authenticated;
