-- Clinic booking: slice 1 schema (run in the Supabase SQL editor)

-- ---------- Types ----------
create type user_role as enum ('admin', 'doctor', 'patient');
create type slot_status as enum ('open', 'booked', 'blocked');

-- Needed for the "no overlapping slots" rule below.
create extension if not exists btree_gist;

-- ---------- Tables ----------
create table departments (
  id   bigint generated always as identity primary key,
  name text not null unique
);

-- One row per signed-up user. Supabase keeps passwords in auth.users;
-- we keep our own data (name, role) here, linked by the same id.
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       user_role not null default 'patient',
  created_at timestamptz not null default now()
);

create table doctors (
  id            bigint generated always as identity primary key,
  profile_id    uuid not null unique references profiles (id) on delete cascade,
  department_id bigint not null references departments (id),
  bio           text
);

create table slots (
  id         bigint generated always as identity primary key,
  doctor_id  bigint not null references doctors (id) on delete cascade,
  starts_at  timestamptz not null,  -- always stored in UTC, converted only for display
  ends_at    timestamptz not null,
  status     slot_status not null default 'open',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- A doctor cannot have two slots whose time ranges overlap.
  -- Adjacent slots (9:00-9:30 then 9:30-10:00) are fine.
  constraint slots_no_overlap
    exclude using gist (doctor_id with =, tstzrange(starts_at, ends_at) with &&)
);

-- ---------- Auto-create a profile when someone signs up ----------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Security: deny by default ----------
-- With RLS on and no policies, the browser-facing API can read and write nothing.
-- We add the exact permissions each role needs in the next slice.
alter table departments enable row level security;
alter table profiles    enable row level security;
alter table doctors     enable row level security;
alter table slots       enable row level security;

-- ---------- Make yourself the first admin ----------
-- 1. Sign up through the app once.
-- 2. Find your user id in Authentication > Users, then run:
--
--   update profiles set role = 'admin' where id = 'PASTE-YOUR-USER-ID';
--
-- New users are always 'patient'. Nobody can pick their own role.