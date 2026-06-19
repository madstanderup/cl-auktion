-- ───────────────────────────────────────────────────────────────────────────
-- Import af håndholdt auktion → nyt spil "VM 2026"
-- Spillere: Jens, Engbjerg (ejer/eksisterende bruger), Bob, Mortensen
-- Kør HELE filen i Supabase SQL Editor. Ejer: jesper.engbjerg@gmail.com
-- ───────────────────────────────────────────────────────────────────────────

-- 0) Sørg for at auction_state-status tillader 'finished' (idempotent)
do $cfix$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'auction_state_status_check'
      and conrelid = 'public.auction_state'::regclass
  ) then
    alter table public.auction_state drop constraint auction_state_status_check;
  end if;
end $cfix$;

alter table public.auction_state
  add constraint auction_state_status_check
  check (status in ('waiting', 'bidding', 'revealed', 'tie_breaker', 'finished'));

do $$
declare
  v_owner   uuid;
  v_game    uuid;
  v_secret  uuid;
  v_code    text;
  v_player  uuid;
  v_team    uuid;
  v_order   int := 0;
  rec       record;
begin
  -- Ejerens auth-bruger (eksisterende: Engbjerg)
  select id into v_owner from auth.users where lower(email) = lower('jesper.engbjerg@gmail.com') limit 1;
  if v_owner is null then
    raise exception 'Ingen auth-bruger med email jesper.engbjerg@gmail.com — opret/login først.';
  end if;

  -- Unik invitationskode
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.games where invite_code = v_code);
  end loop;

  -- Opret spil
  insert into public.games (invite_code, label, created_by)
  values (v_code, 'VM 2026', v_owner)
  returning id, admin_secret into v_game, v_secret;

  -- Seed holdpulje fra katalog (alle 48 hold, ingen ejer endnu)
  insert into public.game_teams (game_id, team_id)
  select v_game, t.id from public.teams t;

  -- Auktionstilstand: afsluttet (auktionen er kørt i hånden)
  insert into public.auction_state (game_id, status, updated_at)
  values (v_game, 'finished', now());

  -- Spillere (coins = resterende beløb). Engbjerg knyttes til auth-bruger.
  insert into public.players (name, coins, points, game_id, user_id) values ('Engbjerg', 37, 0, v_game, v_owner);
  insert into public.players (name, coins, points, game_id) values ('Jens', 0, 0, v_game);
  insert into public.players (name, coins, points, game_id) values ('Bob', 0, 0, v_game);
  insert into public.players (name, coins, points, game_id) values ('Mortensen', 0, 0, v_game);

  -- Tildelinger: (katalognavn, spiller, pris)
  for rec in
    select * from (values
      ('Mexico',                  'Engbjerg',  91),
      ('South Korea',             'Mortensen', 65),
      ('South Africa',            'Mortensen', 41),
      ('Czech Republic',          'Bob',       73),
      ('Canada',                  'Mortensen', 71),
      ('Qatar',                   'Jens',      24),
      ('Bosnia and Herzegovina',  'Bob',       57),
      ('Switzerland',             'Mortensen', 89),
      ('Morocco',                 'Mortensen', 93),
      ('Haiti',                   'Engbjerg',   7),
      ('Brazil',                  'Engbjerg', 193),
      ('Scotland',                'Jens',      72),
      ('United States',           'Bob',       71),
      ('Australia',               'Jens',      70),
      ('Paraguay',                'Bob',       54),
      ('Turkey',                  'Jens',      87),
      ('Ivory Coast',             'Engbjerg',  58),
      ('Curaçao',                 'Bob',       38),
      ('Ecuador',                 'Mortensen', 79),
      ('Germany',                 'Jens',     211),
      ('Japan',                   'Engbjerg',  64),
      ('Tunisia',                 'Bob',       21),
      ('Netherlands',             'Engbjerg', 131),
      ('Sweden',                  'Bob',       86),
      ('Iran',                    'Engbjerg',  41),
      ('Egypt',                   'Bob',       71),
      ('New Zealand',             'Mortensen', 35),
      ('Belgium',                 'Engbjerg', 150),
      ('Saudi Arabia',            'Mortensen', 36),
      ('Cape Verde',              'Engbjerg',  18),
      ('Uruguay',                 'Mortensen',110),
      ('Spain',                   'Jens',     223),
      ('Iraq',                    'Mortensen', 21),
      ('Senegal',                 'Engbjerg',  67),
      ('France',                  'Bob',      214),
      ('Norway',                  'Jens',      96),
      ('Jordan',                  'Engbjerg',  15),
      ('Algeria',                 'Bob',       37),
      ('Argentina',               'Jens',     217),
      ('Austria',                 'Mortensen', 71),
      ('Uzbekistan',              'Mortensen', 21),
      ('DR Congo',                'Bob',       42),
      ('Colombia',                'Engbjerg',  84),
      ('Portugal',                'Mortensen',197),
      ('Ghana',                   'Engbjerg',  44),
      ('Panama',                  'Bob',       23),
      ('Croatia',                 'Mortensen', 71),
      ('England',                 'Bob',      213)
    ) as r(catalog_name, player_name, price)
  loop
    select id into v_team from public.teams where name = rec.catalog_name limit 1;
    if v_team is null then raise exception 'Ukendt hold i katalog: %', rec.catalog_name; end if;

    select id into v_player from public.players where game_id = v_game and name = rec.player_name limit 1;
    if v_player is null then raise exception 'Ukendt spiller: %', rec.player_name; end if;

    -- Sæt ejerskab
    update public.game_teams
    set owner_player_id = v_player
    where game_id = v_game and team_id = v_team;

    -- Indsæt vinder-bud (så pris/ROI vises i bud- og summary-oversigt).
    -- team_name skal være katalognavnet for at matche oversigterne.
    v_order := v_order + 1;
    insert into public.auction_room_bids (player_id, team_name, amount, game_id, round_id, bid_phase, created_at)
    values (v_player, rec.catalog_name, rec.price, v_game, gen_random_uuid(), 1, now() + (v_order || ' seconds')::interval);
  end loop;

  raise notice 'OK — spil "VM 2026" oprettet. Invitationskode: %  (game_id: %)', v_code, v_game;
end $$;

-- Vis invitationskode + admin-nøgle til deling
select label, invite_code, admin_secret, created_at
from public.games
where label = 'VM 2026'
order by created_at desc
limit 1;
