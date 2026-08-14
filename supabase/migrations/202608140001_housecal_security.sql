create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our family',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'parent' check (role in ('parent', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  external_id text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  person text,
  color text,
  source text not null default 'housecal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.display_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.display_devices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null default 'HouseCal display',
  token_hash text not null unique,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists events_household_starts_idx on public.events(household_id, starts_at);
create index if not exists display_devices_household_idx on public.display_devices(household_id);

create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.create_household(household_name text default 'Our family')
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare new_household uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.households(name, created_by) values (household_name, auth.uid()) returning id into new_household;
  insert into public.household_members(household_id, user_id, role) values (new_household, auth.uid(), 'parent');
  return new_household;
end;
$$;

create or replace function public.create_display_pairing(target_household uuid, device_name text default 'HouseCal display')
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare raw_code text;
begin
  if not public.is_household_member(target_household) then raise exception 'Not a household member'; end if;
  raw_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
  insert into public.display_pairing_codes(household_id, code_hash, expires_at)
    values (target_household, encode(digest(raw_code, 'sha256'), 'hex'), now() + interval '10 minutes');
  return query select raw_code, now() + interval '10 minutes';
end;
$$;

create or replace function public.claim_display_pairing(pairing_code text, device_name text default 'HouseCal display')
returns table(device_id uuid, device_token text, household_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare pairing public.display_pairing_codes%rowtype;
declare raw_token text;
declare new_device uuid;
begin
  select * into pairing from public.display_pairing_codes
  where code_hash = encode(digest(upper(trim(pairing_code)), 'sha256'), 'hex')
    and claimed_at is null and expires_at > now()
  order by created_at desc limit 1;
  if pairing.id is null then raise exception 'Pairing code is invalid or expired'; end if;
  raw_token := encode(gen_random_bytes(32), 'hex');
  insert into public.display_devices(household_id, name, token_hash)
    values (pairing.household_id, device_name, encode(digest(raw_token, 'sha256'), 'hex'))
    returning id into new_device;
  update public.display_pairing_codes set claimed_at = now() where id = pairing.id;
  return query select new_device, raw_token, pairing.household_id;
end;
$$;

create or replace function public.get_display_state(display_token text)
returns table(household_id uuid, household_name text, display_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.display_devices d
      set last_seen_at = now()
    where d.token_hash = encode(digest(display_token, 'sha256'), 'hex')
      and d.revoked_at is null
    returning d.household_id, (select h.name from public.households h where h.id = d.household_id), d.id;
end;
$$;

create or replace function public.revoke_display(display_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.display_devices set revoked_at = now()
  where id = display_id and public.is_household_member(household_id);
end;
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.events enable row level security;
alter table public.display_pairing_codes enable row level security;
alter table public.display_devices enable row level security;

create policy "Members can view their household" on public.households for select to authenticated using (public.is_household_member(id));
create policy "Members can view household membership" on public.household_members for select to authenticated using (public.is_household_member(household_id));
create policy "Members can view events" on public.events for select to authenticated using (public.is_household_member(household_id));
create policy "Parents can manage events" on public.events for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Members can view devices" on public.display_devices for select to authenticated using (public.is_household_member(household_id));
create policy "Members can view pairing codes" on public.display_pairing_codes for select to authenticated using (public.is_household_member(household_id));

revoke all on public.households, public.household_members, public.events, public.display_pairing_codes, public.display_devices from anon;
revoke all on public.households, public.household_members, public.events, public.display_pairing_codes, public.display_devices from authenticated;
grant select on public.households, public.household_members, public.events, public.display_devices, public.display_pairing_codes to authenticated;
grant insert, update, delete on public.events to authenticated;
grant execute on function public.create_household(text), public.create_display_pairing(uuid, text), public.claim_display_pairing(text, text), public.get_display_state(text), public.revoke_display(uuid) to anon, authenticated;
