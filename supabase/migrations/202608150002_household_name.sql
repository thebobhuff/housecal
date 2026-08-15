create or replace function public.update_household_name(target_household uuid, new_name text)
returns text language plpgsql security definer set search_path = public as $$
declare cleaned text := nullif(trim(new_name), '');
begin
  if not public.is_household_member(target_household) then raise exception 'Not a household member'; end if;
  if cleaned is null then raise exception 'Family name is required'; end if;
  update public.households set name = left(cleaned, 80) where id = target_household;
  return (select name from public.households where id = target_household);
end;
$$;
grant execute on function public.update_household_name(uuid, text) to authenticated;
