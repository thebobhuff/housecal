create table if not exists public.google_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('calendar', 'photos')),
  access_token_encrypted text,
  refresh_token_encrypted text not null,
  expires_at timestamptz,
  scope text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, provider)
);

create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  provider text not null check (provider in ('calendar', 'photos')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  connection_id uuid references public.google_connections(id) on delete cascade,
  google_calendar_id text not null,
  name text not null,
  color text,
  sync_token text,
  updated_at timestamptz not null default now(),
  unique (household_id, google_calendar_id)
);

create table if not exists public.photo_selections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  google_media_id text not null,
  storage_path text,
  caption text,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  unique (household_id, google_media_id)
);

create unique index if not exists events_google_external_idx
  on public.events(household_id, source, external_id);

alter table public.google_connections enable row level security;
alter table public.oauth_states enable row level security;
alter table public.calendar_sources enable row level security;
alter table public.photo_selections enable row level security;

create policy "Members can view Google connection status"
  on public.google_connections for select to authenticated
  using (public.is_household_member(household_id));
create policy "Members can view calendar sources"
  on public.calendar_sources for select to authenticated
  using (public.is_household_member(household_id));
create policy "Members can view photo selections"
  on public.photo_selections for select to authenticated
  using (public.is_household_member(household_id));

revoke all on public.google_connections, public.oauth_states, public.calendar_sources, public.photo_selections from anon;
revoke all on public.google_connections, public.oauth_states, public.calendar_sources, public.photo_selections from authenticated;
grant select on public.google_connections, public.calendar_sources, public.photo_selections to authenticated;

insert into storage.buckets (id, name, public)
values ('housecal-photos', 'housecal-photos', false)
on conflict (id) do nothing;
