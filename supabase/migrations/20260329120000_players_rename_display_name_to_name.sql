-- Hvis du allerede kørte players-migration med kolonnen display_name, omdøbes den til name.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'display_name'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'name'
  ) then
    alter table public.players rename column display_name to name;
  end if;
end $$;
