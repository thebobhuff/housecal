create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  title text not null, sort_order integer not null default 0, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.routine_completions (
  routine_id uuid not null references public.routines(id) on delete cascade, completed_on date not null,
  completed_by uuid references auth.users(id) on delete set null, completed_at timestamptz not null default now(), primary key (routine_id, completed_on)
);
create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  meal_date date not null, title text not null, subtitle text, recipe_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (household_id, meal_date)
);
create table if not exists public.household_settings (
  household_id uuid primary key references public.households(id) on delete cascade, location_label text, latitude double precision, longitude double precision,
  scene_duration_seconds integer not null default 12 check (scene_duration_seconds between 5 and 180), night_start_hour integer not null default 20 check (night_start_hour between 0 and 23), night_end_hour integer not null default 7 check (night_end_hour between 0 and 23), updated_at timestamptz not null default now()
);
create index if not exists routines_household_idx on public.routines(household_id, sort_order);
create index if not exists meals_household_date_idx on public.meal_plans(household_id, meal_date);
alter table public.routines enable row level security;
alter table public.routine_completions enable row level security;
alter table public.meal_plans enable row level security;
alter table public.household_settings enable row level security;
create policy "Members can view routines" on public.routines for select to authenticated using (public.is_household_member(household_id));
create policy "Parents can manage routines" on public.routines for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Members can view routine completions" on public.routine_completions for select to authenticated using (exists (select 1 from public.routines r where r.id = routine_id and public.is_household_member(r.household_id)));
create policy "Parents can manage routine completions" on public.routine_completions for all to authenticated using (exists (select 1 from public.routines r where r.id = routine_id and public.is_household_member(r.household_id))) with check (exists (select 1 from public.routines r where r.id = routine_id and public.is_household_member(r.household_id)));
create policy "Members can view meal plans" on public.meal_plans for select to authenticated using (public.is_household_member(household_id));
create policy "Parents can manage meal plans" on public.meal_plans for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Members can view household settings" on public.household_settings for select to authenticated using (public.is_household_member(household_id));
create policy "Parents can manage household settings" on public.household_settings for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
revoke all on public.routines, public.routine_completions, public.meal_plans, public.household_settings from anon;
grant select, insert, update, delete on public.routines, public.routine_completions, public.meal_plans, public.household_settings to authenticated;
create or replace function public.ensure_housecal_defaults(target_household uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member(target_household) then raise exception 'Not a household member'; end if;
  insert into public.household_settings(household_id) values (target_household) on conflict do nothing;
  insert into public.routines(household_id, title, sort_order)
  select target_household, item.title, item.sort_order from (values ('Pack soccer bag', 1), ('Feed the dog', 2), ('Put away laundry', 3), ('Water the plants', 4)) as item(title, sort_order)
  where not exists (select 1 from public.routines where household_id = target_household);
  insert into public.meal_plans(household_id, meal_date, title, subtitle) values (target_household, current_date, 'Sheet-pan salmon', 'with roasted vegetables') on conflict (household_id, meal_date) do nothing;
end;
$$;
grant execute on function public.ensure_housecal_defaults(uuid) to authenticated;
