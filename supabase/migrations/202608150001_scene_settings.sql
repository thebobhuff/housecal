alter table public.household_settings
  add column if not exists scene_enabled jsonb not null default '{"Calendar":true,"Photos":true,"Week":true,"Routines":true,"Weather":true,"Traffic":true,"News":true}'::jsonb;
