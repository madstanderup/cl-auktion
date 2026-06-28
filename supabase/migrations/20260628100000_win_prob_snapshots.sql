-- Historiske snapshots af vinder-sandsynlighed pr. spiller (ét pr. spil pr. dag)
create table if not exists public.win_prob_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  snapshot_date date not null,
  player_id uuid not null references public.players(id) on delete cascade,
  win_prob numeric not null,
  points integer not null default 0,
  teams_alive integer not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, snapshot_date, player_id)
);

create index if not exists win_prob_snapshots_game_idx on public.win_prob_snapshots (game_id, snapshot_date);

alter table public.win_prob_snapshots enable row level security;

drop policy if exists "win_prob_snapshots_select_all" on public.win_prob_snapshots;
create policy "win_prob_snapshots_select_all"
on public.win_prob_snapshots for select to anon, authenticated using (true);

drop policy if exists "win_prob_snapshots_insert" on public.win_prob_snapshots;
create policy "win_prob_snapshots_insert"
on public.win_prob_snapshots for insert to anon, authenticated with check (true);

drop policy if exists "win_prob_snapshots_update" on public.win_prob_snapshots;
create policy "win_prob_snapshots_update"
on public.win_prob_snapshots for update to anon, authenticated using (true) with check (true);
