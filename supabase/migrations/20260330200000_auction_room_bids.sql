-- Simpel bud-tabel til auktionsrummet (forside/spillere uden lobby).
-- Undgår navnet public.bids (allerede lobby-/draw-bud i initial_schema).

create table if not exists public.auction_room_bids (
  id uuid primary key default gen_random_uuid (),
  player_id uuid not null references public.players (id) on delete cascade,
  team_name text not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now ()
);

create index if not exists auction_room_bids_player_id_idx on public.auction_room_bids (player_id);
create index if not exists auction_room_bids_team_created_idx on public.auction_room_bids (team_name, created_at desc);

alter table public.auction_room_bids enable row level security;

drop policy if exists "auction_room_bids_select_all" on public.auction_room_bids;
create policy "auction_room_bids_select_all"
on public.auction_room_bids for select to anon, authenticated using (true);

drop policy if exists "auction_room_bids_insert_anon" on public.auction_room_bids;
create policy "auction_room_bids_insert_anon"
on public.auction_room_bids for insert to anon with check (true);

drop policy if exists "auction_room_bids_insert_authenticated" on public.auction_room_bids;
create policy "auction_room_bids_insert_authenticated"
on public.auction_room_bids for insert to authenticated with check (true);

alter table public.auction_room_bids replica identity full;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auction_room_bids'
  ) then
    alter publication supabase_realtime add table public.auction_room_bids;
  end if;
end $pub$;

notify pgrst, 'reload schema';
