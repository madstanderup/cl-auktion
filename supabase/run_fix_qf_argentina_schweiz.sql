-- Reparation: Zafronix meldte kvartfinalen Argentina–Schweiz (2026-100) som
-- "finished 0-0 uden forlængelse/straffe" — et umuligt knockout-resultat.
-- Nulstil kampen til 'live' i alle spil, så den kan opdateres igen (af API'et
-- når data rettes, eller manuelt i admin), og genberegn point.
--
-- VIGTIGT: Deploy sync-hærdningen FØRST (ellers sætter næste cron-kørsel
-- kampen tilbage til finished 0-0).
--
-- Kør i Supabase SQL Editor.

update public.wc_matches
set status      = 'live',
    home_score  = null,
    away_score  = null,
    result_type = null,
    winner_side = null
where zafronix_match_id = '2026-100'
  and status = 'finished'
  and home_score = 0 and away_score = 0
  and winner_side is null;

-- Genberegn point for de berørte spil
do $$
declare g uuid;
begin
  for g in select distinct game_id from public.wc_matches where zafronix_match_id = '2026-100'
  loop
    perform public.recalculate_game_points(g);
  end loop;
end $$;

-- Verifikation
select game_id, home_team, away_team, home_score, away_score, result_type, winner_side, status
from public.wc_matches
where zafronix_match_id = '2026-100';
