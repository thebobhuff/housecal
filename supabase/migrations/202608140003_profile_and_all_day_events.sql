alter table public.events
  add column if not exists all_day boolean not null default false;

alter table public.google_connections
  add column if not exists profile_name text;
alter table public.google_connections
  add column if not exists profile_email text;
alter table public.google_connections
  add column if not exists profile_picture_url text;
