-- Seed: de 36 CL 26/27-hold i teams-kataloget (Elo-rangeret, se
-- src/lib/tournaments/cl2627-teams.ts — sort_seed = Elo-placering).
-- KRÆVER at 20260702100000_tournament_type.sql er kørt først!
--
-- Idempotent og sikker at køre igen. Sætning 1 gør tre ting i ÉN transaktion:
--   1) indsætter hold der mangler
--   2) retter short_name/sort_seed på hold der allerede findes
--   3) SLETTER udgåede cl2627-hold (fx den gamle 25/26-dummyliste) — men KUN
--      hvis holdet ikke er i brug i et spil, en auktion, en trup, en kamp
--      eller en pointpostering. Er det i brug, står det urørt og dukker op i
--      verifikationen nedenfor.
--
-- VIL DU SE HVAD DER SKER, FØR DU GEMMER DET?
--   Fjern kommentaren på 'begin;' herunder OG på 'rollback;' allernederst,
--   og kør så hele filen som ÉT run i SQL-editoren. Kig på kolonnerne
--   "indsat / opdateret / slettet" og på holdlisten til sidst — og rul
--   derefter det hele tilbage.
--
--   VIGTIGT: begin; og rollback; SKAL med i samme run som resten. Supabase
--   kører via connection pooling, så en transaktion startet i ét run er ikke
--   nødvendigvis den samme session i næste run.
--
--   Ser tallene rigtige ud: sæt kommentarerne tilbage på begge linjer og kør
--   igen — så committer scriptet af sig selv.

-- begin;

do $$
begin
  -- Guard: tournament_type skal findes på både games og teams, og den nye
  -- create_game skal være på plads — ellers ville spiloprettelse blande
  -- CL-hold ind i VM-spil.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'teams' and column_name = 'tournament_type'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'tournament_type'
  ) then
    raise exception 'Kør 20260702100000_tournament_type.sql FØRST (tournament_type-kolonner mangler).';
  end if;
end $$;

-- Holdlisten står ÉT sted: en CTE, ikke en tabel. Insert/update/delete er
-- data-modificerende CTE'er i samme sætning, så der oprettes intet objekt
-- (og dermed ingen tabel uden RLS).
with cl_seed (name, short_name, sort_seed) as (
  values
    ('Bayern München',        'FCB',  1),
    ('Arsenal',               'ARS',  2),
    ('PSG',                   'PSG',  3),
    ('Barcelona',             'BAR',  4),
    ('Real Madrid',           'RMA',  5),
    ('Manchester City',       'MCI',  6),
    ('Inter',                 'INT',  7),
    ('Manchester United',     'MUN',  8),
    ('Aston Villa',           'AVL',  9),
    ('Borussia Dortmund',     'BVB', 10),
    ('Sporting CP',           'SCP', 11),
    ('AS Roma',               'ROM', 12),
    ('Como',                  'COM', 13),
    ('Liverpool',             'LIV', 14),
    ('PSV',                   'PSV', 15),
    ('Atlético Madrid',       'ATM', 16),
    ('FC Porto',              'POR', 17),
    ('Napoli',                'NAP', 18),
    ('VfB Stuttgart',         'VFB', 19),
    ('Club Brugge',           'CLU', 20),
    ('RB Leipzig',            'RBL', 21),
    ('Bodø/Glimt',            'BOD', 22),
    ('RC Lens',               'LEN', 23),
    ('Real Betis',            'BET', 24),
    ('Villarreal',            'VIL', 25),
    ('Galatasaray',           'GAL', 26),
    ('Lille',                 'LIL', 27),
    ('Slavia Praha',          'SLA', 28),
    ('Fenerbahçe',            'FEN', 29),
    ('Shakhtar Donetsk',      'SHA', 30),
    ('AEK Athen',             'AEK', 31),
    ('Feyenoord',             'FEY', 32),
    ('Viking FK',             'VIK', 33),
    ('Slovan Bratislava',     'SLB', 34),
    ('LASK Linz',             'LAS', 35),
    ('Sabah FK',              'SAB', 36)
),
ins as (
  insert into public.teams (name, short_name, logo_url, sort_seed, tournament_type)
  select s.name, s.short_name, null::text, s.sort_seed, 'cl2627'
  from cl_seed s
  where not exists (
    select 1 from public.teams t
    where t.name = s.name and t.tournament_type = 'cl2627'
  )
  returning 1
),
upd as (
  update public.teams t
  set short_name = s.short_name,
      sort_seed  = s.sort_seed
  from cl_seed s
  where t.tournament_type = 'cl2627'
    and t.name = s.name
    and (t.short_name is distinct from s.short_name or t.sort_seed is distinct from s.sort_seed)
  returning 1
),
del as (
  -- Rører kun hold der hverken er i seed-listen ELLER i brug nogen steder.
  delete from public.teams t
  where t.tournament_type = 'cl2627'
    and not exists (select 1 from cl_seed s                 where s.name = t.name)
    and not exists (select 1 from public.game_teams x       where x.team_id = t.id)
    and not exists (select 1 from public.auction_draws x    where x.team_id = t.id)
    and not exists (select 1 from public.roster_entries x   where x.team_id = t.id)
    and not exists (select 1 from public.fantasy_point_events x where x.team_id = t.id)
    and not exists (select 1 from public.matches x          where x.home_team_id = t.id or x.away_team_id = t.id)
    and not exists (select 1 from public.auction_state x    where x.current_team_id = t.id)
  returning t.name
)
select
  (select count(*) from ins) as indsat,
  (select count(*) from upd) as opdateret,
  (select count(*) from del) as slettet;

-- Verifikation: cl2627 skal stå på præcis 36.
select tournament_type, count(*) as antal
from public.teams
group by tournament_type
order by tournament_type;

-- Er antallet over 36, er der udgåede hold der ikke kunne fjernes, fordi de
-- indgår i et eksisterende spil. De står her sammen med de rigtige 36 —
-- de forkerte er lette at få øje på (Chelsea, Juventus, FC København osv.).
-- Er spillet dødt, kan det slettes via superadmin, hvorefter scriptet kan
-- køres igen og rydde op.
select name, short_name, sort_seed
from public.teams
where tournament_type = 'cl2627'
order by sort_seed, name;

-- rollback;
