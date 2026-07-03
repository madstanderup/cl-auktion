-- Tillad CL-stages (league, playoff) i wc_matches.stage.
-- Ren udvidelse — eksisterende VM-rækker er upåvirkede.
do $cfix$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'wc_matches_stage_check'
      and conrelid = 'public.wc_matches'::regclass
  ) then
    alter table public.wc_matches drop constraint wc_matches_stage_check;
  end if;
end $cfix$;

alter table public.wc_matches add constraint wc_matches_stage_check
  check (stage in ('group', 'league', 'playoff', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final'));
