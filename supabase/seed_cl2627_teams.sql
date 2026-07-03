-- Seed: 36 CL 26/27-hold (DUMMY = 25/26-deltagerne) i teams-kataloget.
-- KRÆVER at 20260702100000_tournament_type.sql er kørt først!
-- Idempotent: springer hold over der allerede findes.

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

insert into public.teams (name, short_name, logo_url, sort_seed, tournament_type)
select v.name, v.short_name, null, v.seed, 'cl2627'
from (values
  ('Real Madrid',           'RMA', 1),
  ('Liverpool',             'LIV', 2),
  ('PSG',                   'PSG', 3),
  ('Barcelona',             'BAR', 4),
  ('Bayern München',        'FCB', 5),
  ('Manchester City',       'MCI', 6),
  ('Arsenal',               'ARS', 7),
  ('Inter',                 'INT', 8),
  ('Chelsea',               'CHE', 9),
  ('Atlético Madrid',       'ATM', 10),
  ('Bayer Leverkusen',      'LEV', 11),
  ('Borussia Dortmund',     'BVB', 12),
  ('Juventus',              'JUV', 13),
  ('Napoli',                'NAP', 14),
  ('Newcastle',             'NEW', 15),
  ('Atalanta',              'ATA', 16),
  ('Benfica',               'BEN', 17),
  ('Sporting CP',           'SCP', 18),
  ('Tottenham',             'TOT', 19),
  ('PSV',                   'PSV', 20),
  ('Villarreal',            'VIL', 21),
  ('Athletic Club',         'ATH', 22),
  ('Ajax',                  'AJX', 23),
  ('Eintracht Frankfurt',   'SGE', 24),
  ('Monaco',                'MON', 25),
  ('Marseille',             'OM',  26),
  ('Galatasaray',           'GAL', 27),
  ('Club Brugge',           'CLU', 28),
  ('Olympiacos',            'OLY', 29),
  ('Bodø/Glimt',            'BOD', 30),
  ('Union Saint-Gilloise',  'USG', 31),
  ('Slavia Praha',          'SLA', 32),
  ('FC København',          'FCK', 33),
  ('Qarabağ',               'QAR', 34),
  ('Pafos',                 'PAF', 35),
  ('Kairat Almaty',         'KAI', 36)
) as v(name, short_name, seed)
where not exists (
  select 1 from public.teams t
  where t.name = v.name and t.tournament_type = 'cl2627'
);

-- Verifikation
select tournament_type, count(*) as antal
from public.teams
group by tournament_type
order by tournament_type;
