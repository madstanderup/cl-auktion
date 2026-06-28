-- Gem også forventet slutpoint i snapshots (til historik-graf)
alter table public.win_prob_snapshots
  add column if not exists expected_points numeric not null default 0;
