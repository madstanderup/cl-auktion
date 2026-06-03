/*
  Fuld dashboard-opsætning. Opdateret: bruger auction_room_bids (ikke public.bids).

  Alternativ: supabase/run_auction_complete_fix.sql (samme idé, én fil).
*/

do $create_auction_state$
begin
  if to_regclass('public.auction_state') is null then
    create table public.auction_state (
      id uuid primary key default gen_random_uuid (),
      current_team_name text,
      status text not null default 'waiting'
        check (status in ('waiting', 'bidding', 'revealed')),
      updated_at timestamptz not null default now ()
    );
  end if;
end $create_auction_state$;

comment on table public.auction_state is 'Én aktiv række styrer auktionens globale UI (Realtime).';

insert into public.auction_state (current_team_name, status)
select null, 'waiting'
where not exists (select 1 from public.auction_state);

do $create_room_bids$
begin
  if to_regclass('public.auction_room_bids') is null then
    create table public.auction_room_bids (
      id uuid primary key default gen_random_uuid (),
      player_id uuid not null references public.players (id) on delete cascade,
      team_name text not null,
      amount integer not null check (amount > 0),
      created_at timestamptz not null default now ()
    );
  end if;
end $create_room_bids$;

create index if not exists auction_room_bids_player_id_idx on public.auction_room_bids (player_id);
create index if not exists auction_room_bids_team_created_idx on public.auction_room_bids (team_name, created_at desc);

alter table public.auction_state enable row level security;
alter table public.auction_room_bids enable row level security;

drop policy if exists "auction_state_select_all" on public.auction_state;
create policy "auction_state_select_all"
  on public.auction_state for select to anon, authenticated using (true);

drop policy if exists "auction_room_bids_select_all" on public.auction_room_bids;
create policy "auction_room_bids_select_all"
  on public.auction_room_bids for select to anon, authenticated using (true);

drop policy if exists "auction_room_bids_insert_anon" on public.auction_room_bids;
create policy "auction_room_bids_insert_anon"
  on public.auction_room_bids for insert to anon with check (true);

drop policy if exists "auction_room_bids_insert_authenticated" on public.auction_room_bids;
create policy "auction_room_bids_insert_authenticated"
  on public.auction_room_bids for insert to authenticated with check (true);

alter table public.auction_state replica identity full;
alter table public.auction_room_bids replica identity full;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auction_state'
  ) then
    alter publication supabase_realtime add table public.auction_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auction_room_bids'
  ) then
    alter publication supabase_realtime add table public.auction_room_bids;
  end if;
end $pub$;

notify pgrst, 'reload schema';
