-- Global auktionstilstand (én række) til realtime-auktionsrummet.
-- NB: public.bids er ALLEREDE brugt i initial_schema (auction_draws/lobby).
--     Rum-bud ligger i public.auction_room_bids (næste migration).

create table if not exists public.auction_state (
  id uuid primary key default gen_random_uuid (),
  current_team_name text,
  status text not null default 'waiting'
    check (status in ('waiting', 'bidding', 'revealed')),
  updated_at timestamptz not null default now ()
);

comment on table public.auction_state is 'Én aktiv række styrer auktionens globale UI (Realtime).';

insert into public.auction_state (current_team_name, status)
select null, 'waiting'
where not exists (select 1 from public.auction_state);

alter table public.auction_state enable row level security;

drop policy if exists "auction_state_select_all" on public.auction_state;
create policy "auction_state_select_all"
on public.auction_state for select to anon, authenticated using (true);

alter table public.auction_state replica identity full;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auction_state'
  ) then
    alter publication supabase_realtime add table public.auction_state;
  end if;
end $pub$;

notify pgrst, 'reload schema';
