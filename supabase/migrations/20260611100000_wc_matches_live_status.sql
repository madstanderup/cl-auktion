-- Tilføj 'live' som gyldig status for wc_matches
alter table public.wc_matches drop constraint if exists wc_matches_status_check;
alter table public.wc_matches add constraint wc_matches_status_check
  check (status in ('scheduled', 'live', 'finished'));
