-- Sidebets mellem spillere i et spil
create table if not exists public.side_bets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  -- Bookie = den der oprindeligt udbød væddemålet. Ændres aldrig under forhandling.
  bookie_player_id uuid not null references public.players(id) on delete cascade,
  better_player_id uuid not null references public.players(id) on delete cascade,
  description text not null default '',
  odds numeric not null check (odds > 1),
  stake numeric not null check (stake > 0),
  currency text not null check (currency in ('kr', 'øl')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  -- Hvis tur er sat: den spiller der skal reagere på det aktuelle tilbud
  turn_player_id uuid not null references public.players(id) on delete cascade,
  read_by_bookie boolean not null default true,
  read_by_better boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists side_bets_game_idx on public.side_bets (game_id);

alter table public.side_bets enable row level security;

drop policy if exists "side_bets_select_all" on public.side_bets;
create policy "side_bets_select_all"
on public.side_bets for select to anon, authenticated using (true);

drop policy if exists "side_bets_insert_anon" on public.side_bets;
create policy "side_bets_insert_anon"
on public.side_bets for insert to anon with check (true);

drop policy if exists "side_bets_insert_authenticated" on public.side_bets;
create policy "side_bets_insert_authenticated"
on public.side_bets for insert to authenticated with check (true);

drop policy if exists "side_bets_update_anon" on public.side_bets;
create policy "side_bets_update_anon"
on public.side_bets for update to anon using (true) with check (true);

drop policy if exists "side_bets_update_authenticated" on public.side_bets;
create policy "side_bets_update_authenticated"
on public.side_bets for update to authenticated using (true) with check (true);

alter table public.side_bets replica identity full;
