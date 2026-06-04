-- VM 2026 hold importeret fra Zafronix API (2026-06-04T19:14:21.924Z)
-- Kør dette i Supabase SQL Editor for at erstatte teams med de 48 VM-hold.
-- ADVARSEL: sletter eksisterende hold og nulstiller game_teams!

begin;

-- Frigiv ejerskab i game_teams
update public.game_teams set owner_player_id = null;

-- Ryd game_teams og teams
delete from public.game_teams;
delete from public.teams;

-- Indsæt VM 2026 hold
insert into public.teams (name, short_name, logo_url, sort_seed) values
  ('Mexico', 'MEX', null, 1),
  ('South Africa', 'RSA', null, 2),
  ('South Korea', 'KOR', null, 3),
  ('Czech Republic', 'CZE', null, 4),
  ('Canada', 'CAN', null, 5),
  ('Bosnia and Herzegovina', 'BIH', null, 6),
  ('Qatar', 'QAT', null, 7),
  ('Switzerland', 'SUI', null, 8),
  ('Brazil', 'BRA', null, 9),
  ('Morocco', 'MAR', null, 10),
  ('Haiti', 'HAI', null, 11),
  ('Scotland', 'SCO', null, 12),
  ('United States', 'USA', null, 13),
  ('Paraguay', 'PAR', null, 14),
  ('Australia', 'AUS', null, 15),
  ('Turkey', 'TUR', null, 16),
  ('Germany', 'GER', null, 17),
  ('Curaçao', 'CUW', null, 18),
  ('Ivory Coast', 'CIV', null, 19),
  ('Ecuador', 'ECU', null, 20),
  ('Netherlands', 'NED', null, 21),
  ('Japan', 'JPN', null, 22),
  ('Sweden', 'SWE', null, 23),
  ('Tunisia', 'TUN', null, 24),
  ('Belgium', 'BEL', null, 25),
  ('Egypt', 'EGY', null, 26),
  ('Iran', 'IRN', null, 27),
  ('New Zealand', 'NZL', null, 28),
  ('Spain', 'ESP', null, 29),
  ('Cape Verde', 'CPV', null, 30),
  ('Saudi Arabia', 'KSA', null, 31),
  ('Uruguay', 'URU', null, 32),
  ('France', 'FRA', null, 33),
  ('Senegal', 'SEN', null, 34),
  ('Iraq', 'IRQ', null, 35),
  ('Norway', 'NOR', null, 36),
  ('Argentina', 'ARG', null, 37),
  ('Algeria', 'ALG', null, 38),
  ('Austria', 'AUT', null, 39),
  ('Jordan', 'JOR', null, 40),
  ('Portugal', 'POR', null, 41),
  ('DR Congo', 'COD', null, 42),
  ('Uzbekistan', 'UZB', null, 43),
  ('Colombia', 'COL', null, 44),
  ('England', 'ENG', null, 45),
  ('Croatia', 'CRO', null, 46),
  ('Ghana', 'GHA', null, 47),
  ('Panama', 'PAN', null, 48);

-- Genopfyld game_teams for alle eksisterende spil
insert into public.game_teams (game_id, team_id)
select g.id, t.id
from public.games g
cross join public.teams t
on conflict (game_id, team_id) do nothing;

commit;
