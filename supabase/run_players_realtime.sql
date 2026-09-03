-- players manglede i supabase_realtime-publikationen. Uden den fik klienterne
-- aldrig besked naar en spillers moenter aendrede sig, og siden kompenserede
-- med at polle hele auktionstilstanden hvert 2,5 sekund (10 REST-kald per
-- klient per tick). Med publikationen paa plads baerer realtime opdateringen,
-- og pollingen er kun et langsomt sikkerhedsnet.

-- REPLICA IDENTITY FULL saa filteret game_id=eq.<id> ogsaa virker paa DELETE.
alter table public.players replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end $$;
