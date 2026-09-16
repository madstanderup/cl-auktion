-- ───────────────────────────────────────────────────────────────────────────
-- Fjern VM 2026-kampene der blev indsat i CL-spillene.
--
-- Baggrund: 13. september 2026 kl. 06:01 UTC indsatte VM-syncen
-- (/api/sync-matches) alle 103 VM 2026-kampe i SAMTLIGE spil — også de to
-- cl2627-spil. Fordi stage-navnene er fælles ("round_of_16", "final", ...),
-- læste CL-simuleringen VM's knockout som CL-opgør: hele knockout-træet blev
-- låst, forventet slutpoint faldt ~7.000 → ~5.000, og estimatet runde for
-- runde fik kolonner helt frem til "Finale" efter én spillet ligarunde.
--
-- Koden ignorerer nu fremmede kampe (cl-sim.ts / est-rounds.ts), så tallene er
-- rigtige igen uden denne oprydning — men rækkerne står stadig og forurener
-- kamplisten i CL-spillene. Scriptet fjerner dem.
--
-- players.points er IKKE påvirket: pointmotoren slår op på holdnavn, og ingen
-- VM-landshold ejes i et CL-spil. Ingen genberegning er nødvendig.
--
-- Kun cl2627-spil røres. VM-spillene har lovlige kampe hvor BEGGE holdnavne
-- afviger fra katalogets stavemåde ("Rep. of Korea", "Bosnia/Herzeg." — de
-- aliaser lever i TypeScript, ikke i public.teams), så den samme regel ville
-- slette rigtige kampe der.
--
-- VIL DU SE HVAD DER SKER, FØR DU GEMMER DET?
--   Fjern kommentaren på 'begin;' herunder OG på 'rollback;' allernederst,
--   og kør så HELE filen som ÉT run i SQL-editoren. Supabase kører via
--   connection pooling, så en transaktion startet i ét run er ikke
--   nødvendigvis den samme session i næste run — begge linjer SKAL med i
--   samme kørsel. Ser tallene rigtige ud: sæt kommentarerne tilbage og kør
--   igen, så committer scriptet af sig selv.
-- ───────────────────────────────────────────────────────────────────────────

-- begin;

-- En kamp i et CL-spil er fremmed, hvis INGEN af de to hold findes i
-- CL-katalogen. Rækker med TBD røres ikke — de er pladsholdere for runder der
-- endnu ikke er trukket.
create temporary view foreign_cl_matches as
select m.id, m.game_id, g.label, m.stage, m.home_team, m.away_team, m.match_date
from public.wc_matches m
join public.games g on g.id = m.game_id
where g.tournament_type = 'cl2627'
  and m.home_team <> 'TBD'
  and m.away_team <> 'TBD'
  and not exists (
    select 1 from public.teams t
    where t.tournament_type = 'cl2627'
      and lower(t.name) in (lower(m.home_team), lower(m.away_team))
  );

-- 1) Overblik: hvad ville blive slettet, pr. spil og runde?
--    Forventet: 'group' 72, 'round_of_32' 16, 'round_of_16' 8,
--    'quarter_final' 4, 'semi_final' 2, 'final' 1 — pr. CL-spil.
select label, stage, count(*) as kampe
from foreign_cl_matches
group by label, stage
order by label, stage;

-- 2) Stikprøve til øjesyn — her skal der stå landshold, ikke klubber
select label, stage, home_team, away_team, match_date
from foreign_cl_matches
order by label, match_date
limit 20;

-- 3) Slet
delete from public.wc_matches m
where m.id in (select id from foreign_cl_matches);

-- 4) Kontrol: CL-spillene må kun have ligafasens 144 kampe tilbage
--    (knockout-kampene oprettes først når UEFA offentliggør lodtrækningen).
select g.label, m.stage, count(*) as kampe
from public.wc_matches m
join public.games g on g.id = m.game_id
where g.tournament_type = 'cl2627'
group by g.label, m.stage
order by g.label, m.stage;

-- rollback;
