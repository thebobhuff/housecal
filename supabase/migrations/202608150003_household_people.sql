create table if not exists public.household_people (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  name text not null, email text, color text not null default '#6d7b70', tint text not null default '#dfe8df',
  show_on_display boolean not null default true, created_at timestamptz not null default now(), unique (household_id, name)
);
alter table public.household_people enable row level security;
create policy "Members can view household people" on public.household_people for select to authenticated using (public.is_household_member(household_id));
create policy "Members can manage household people" on public.household_people for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
revoke all on public.household_people from anon;
grant select, insert, update, delete on public.household_people to authenticated;
insert into public.household_people(household_id, name, color, tint)
select h.id, seed.name, seed.color, seed.tint from public.households h
cross join (values ('Everyone', '#6d7b70', '#dfe8df'), ('Maya', '#c96f52', '#f6ddd3'), ('Dad', '#6686a4', '#dbe6f0'), ('Leo', '#c89b45', '#f4e7bf')) as seed(name, color, tint)
where not exists (select 1 from public.household_people p where p.household_id = h.id);
