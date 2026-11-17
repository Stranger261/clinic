-- "Remember this device": after a patient enters their 2FA code, they can choose to skip the code on that
-- browser for 30 days. The database makes the decision, not the page:
--  * the browser keeps a random token in an httpOnly cookie, and the server sends it to the database in a
--    header (x-device-token). The database stores only a hash of it, so a leaked table cannot be used to sign in.
--  * the token only counts for the person it was made for, until it expires, is removed, or their 2FA is changed.
--  * a device can only be remembered right after entering the code (a session at assurance level aal2).

create table trusted_devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  factor_id  uuid not null,   -- the 2FA factor that was in use; replacing the factor invalidates the device
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label      text not null default 'Unknown device' check (char_length(label) between 1 and 80),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index trusted_devices_user_idx on trusted_devices (user_id);

-- Deny by default: only the functions below touch this table.
alter table trusted_devices enable row level security;

-- The hash of the device token sent with this request (null when there is none).
create function public.current_device_hash()
returns text
language sql
stable
set search_path = ''
as $$
  select encode(
    sha256(convert_to(nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-device-token', ''), 'UTF8')),
    'hex'
  );
$$;
revoke execute on function public.current_device_hash() from public, anon, authenticated;

-- 2FA is satisfied when: the session passed the code step, OR the user has no 2FA, OR this request carries
-- a valid remembered-device token. (Same name and inputs as in 016, so create or replace is enough.)
create or replace function public.mfa_satisfied()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors
        where user_id = (select auth.uid()) and status = 'verified'
      )
      or exists (
        select 1
        from public.trusted_devices d
        join auth.mfa_factors f on f.id = d.factor_id and f.user_id = d.user_id and f.status = 'verified'
        where d.user_id = (select auth.uid())
          and d.token_hash = public.current_device_hash()
          and d.revoked_at is null
          and d.expires_at > now()
      );
$$;

-- Remember this device for 30 days. Only allowed right after the code step.
create function public.create_trusted_device(p_token_hash text, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := (select auth.uid());
  v_factor uuid;
  v_label  text := left(btrim(coalesce(p_label, '')), 80);
begin
  if v_user is null then
    raise exception 'Please sign in.';
  end if;
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Enter your verification code first, then choose to remember this device.';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'That device token is not valid.';
  end if;

  select id into v_factor from auth.mfa_factors
  where user_id = v_user and status = 'verified'
  order by created_at desc
  limit 1;
  if v_factor is null then
    raise exception 'Turn on two-step verification first.';
  end if;

  insert into public.trusted_devices (user_id, factor_id, token_hash, label, expires_at)
  values (v_user, v_factor, p_token_hash, coalesce(nullif(v_label, ''), 'Unknown device'), now() + interval '30 days');

  -- Keep at most 10 remembered devices per person: the oldest ones are removed.
  update public.trusted_devices set revoked_at = now()
  where user_id = v_user and revoked_at is null
    and id in (
      select id from public.trusted_devices
      where user_id = v_user and revoked_at is null
      order by created_at desc
      offset 10
    );
end;
$$;

-- The signed-in person's remembered devices (the one making this request is flagged).
create function public.list_trusted_devices()
returns table (id uuid, label text, created_at timestamptz, expires_at timestamptz, is_current boolean)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  perform public.require_mfa();
  return query
  select d.id, d.label, d.created_at, d.expires_at, coalesce(d.token_hash = public.current_device_hash(), false)
  from public.trusted_devices d
  join auth.mfa_factors f on f.id = d.factor_id and f.user_id = d.user_id and f.status = 'verified'
  where d.user_id = (select auth.uid())
    and d.revoked_at is null
    and d.expires_at > now()
  order by d.created_at desc;
end;
$$;

-- Stop trusting one device. Returns true when it was the device making this request.
create function public.revoke_trusted_device(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  perform public.require_mfa();
  update public.trusted_devices set revoked_at = now()
  where id = p_id and user_id = (select auth.uid()) and revoked_at is null
  returning token_hash into v_hash;
  if not found then
    return false;
  end if;
  return coalesce(v_hash = public.current_device_hash(), false);
end;
$$;

-- Stop trusting every device (used when signing out everywhere).
create function public.revoke_all_trusted_devices()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_mfa();
  update public.trusted_devices set revoked_at = now()
  where user_id = (select auth.uid()) and revoked_at is null;
end;
$$;

revoke execute on function public.create_trusted_device(text, text) from public, anon;
revoke execute on function public.list_trusted_devices() from public, anon;
revoke execute on function public.revoke_trusted_device(uuid) from public, anon;
revoke execute on function public.revoke_all_trusted_devices() from public, anon;
grant execute on function public.create_trusted_device(text, text) to authenticated;
grant execute on function public.list_trusted_devices() to authenticated;
grant execute on function public.revoke_trusted_device(uuid) to authenticated;
grant execute on function public.revoke_all_trusted_devices() to authenticated;
