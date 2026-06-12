-- Tilføj stadion, by og trænere til wc_matches
alter table public.wc_matches
  add column if not exists stadium   text,
  add column if not exists city      text,
  add column if not exists managers  jsonb;
