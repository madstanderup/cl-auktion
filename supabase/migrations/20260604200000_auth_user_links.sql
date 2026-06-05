-- Kobl spillere og spil til Supabase Auth-brugere

-- Spillere: tilknyt auth-bruger (nullable — eksisterende anonyme rækker beholder null)
alter table public.players
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists players_user_id_game_id_idx
  on public.players(user_id, game_id);

-- Spil: hvem oprettede det (nullable — eksisterende spil beholder null)
alter table public.games
  add column if not exists created_by uuid references auth.users(id) on delete set null;

notify pgrst, 'reload schema';
