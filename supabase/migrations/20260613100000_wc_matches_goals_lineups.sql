-- Tilføj goals, cards, lineups og substitutions til wc_matches
alter table public.wc_matches
  add column if not exists goals         jsonb,
  add column if not exists cards         jsonb,
  add column if not exists lineups       jsonb,
  add column if not exists substitutions jsonb;
