-- ───────────────────────────────────────────────────────────────────────────
-- Import af håndholdt auktion → nyt spil "CL 26/27" (tournament_type cl2627)
-- Spillere: Bruun, Mortensen, Bob, Engbjerg (ejer/eksisterende bruger)
--
-- KRÆVER at seed_cl2627_teams.sql er kørt, så de 36 CL-hold står i katalogen.
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
  -- ── Konfiguration ────────────────────────────────────────────────────────
  -- Vært/admin (games.created_by) — SKAL udfyldes før kørsel, og kontoen skal
  -- findes i auth.users. Spiller værten selv med, skrives samme email ikke ind
  -- i spillerlisten længere nede; lad den stå som null dér og lad koblingen ske
  -- via invitationskoden.
  -- Repoet er offentligt, så rigtige mailadresser hører ikke hjemme i filen.
  c_owner_email constant text := 'UDFYLD-VAERTENS-EMAIL@example.com';
  c_label       constant text := 'CL 26/27';
  -- ─────────────────────────────────────────────────────────────────────────
  v_owner   uuid;
  v_game    uuid;
  v_secret  uuid;
  v_code    text;
  v_player  uuid;
  v_team    uuid;
  v_user    uuid;
  v_order   int := 0;
  v_problem text;
  rec       record;
begin
  -- Guard: turneringskolonnerne skal findes, ellers ville holdpuljen blive
  -- seedet med VM-hold i et CL-spil.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'teams' and column_name = 'tournament_type'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'tournament_type'
  ) then
    raise exception 'Kør 20260702100000_tournament_type.sql FØRST (tournament_type-kolonner mangler).';
  end if;

  -- Guard: CL-katalogen skal være komplet (36 hold)
  if (select count(*) from public.teams where tournament_type = 'cl2627') <> 36 then
    raise exception 'Katalogen har % cl2627-hold, forventede 36 — kør seed_cl2627_teams.sql først.',
      (select count(*) from public.teams where tournament_type = 'cl2627');
  end if;

  -- Guard: importér ikke det samme spil to gange
  if exists (select 1 from public.games where tournament_type = 'cl2627' and label = c_label) then
    raise exception 'Der findes allerede et cl2627-spil med label "%" — slet det først, eller vælg et andet label.', c_label;
  end if;

  -- Ejerens auth-bruger
  select id into v_owner from auth.users where lower(email) = lower(c_owner_email) limit 1;
  if v_owner is null then
    raise exception 'Ingen auth-bruger med email % — opret/login først.', c_owner_email;
  end if;

  -- Unik invitationskode
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.games where invite_code = v_code);
  end loop;

  -- Opret spil
  insert into public.games (invite_code, label, created_by, tournament_type)
  values (v_code, c_label, v_owner, 'cl2627')
  returning id, admin_secret into v_game, v_secret;

  -- Seed holdpulje fra katalogen (kun de 36 CL-hold, ingen ejer endnu)
  insert into public.game_teams (game_id, team_id)
  select v_game, t.id from public.teams t where t.tournament_type = 'cl2627';

  -- Auktionstilstand: afsluttet (auktionen er kørt i hånden)
  insert into public.auction_state (game_id, status, updated_at)
  values (v_game, 'finished', now());

  -- Spillere: (navn, resterende mønter, auth-email).
  -- Email kobler spilleren direkte til sin konto, så spillet står under
  -- "Mine spil" fra start. Står emailen som null, knyttes spilleren i stedet
  -- automatisk, første gang han går ind med invitationskoden og skriver sit
  -- navn præcis som herunder (forsiden kobler navn → indlogget bruger).
  -- Er en email angivet, men kontoen ikke findes, stopper scriptet med fejl —
  -- så en tastefejl ikke ender som en ukoblet spiller.
  --
  -- Emailerne står som null her, fordi repoet er offentligt: spillernes
  -- adresser hører ikke til i versionsstyringen. Koblingen sker i stedet ved
  -- første login med invitationskoden. Vil du koble dem på forhånd, så skriv
  -- adresserne ind lokalt og lad være med at committe ændringen.
  for rec in
    select * from (values
      ('Engbjerg',    0, null::text),
      ('Bruun',      46, null),
      ('Mortensen',  20, null),
      ('Bob',       119, null)
    ) as r(player_name, coins, email)
  loop
    if rec.email is null then
      v_user := null;
    else
      select id into v_user from auth.users where lower(email) = lower(rec.email) limit 1;
      if v_user is null then
        raise exception 'Ingen auth-bruger med email % (spiller %) — opret kontoen først, eller sæt emailen til null.',
          rec.email, rec.player_name;
      end if;
    end if;

    insert into public.players (name, coins, points, game_id, user_id)
    values (rec.player_name, rec.coins, 0, v_game, v_user);
  end loop;

  -- Tildelinger: (katalognavn, spiller, pris).
  -- Venstre kolonne er katalognavnene fra seed_cl2627_teams.sql — de afviger
  -- enkelte steder fra auktionsarkets skrivemåde: AEK Athens → AEK Athen,
  -- Atlético de Madrid → Atlético Madrid, LASK → LASK Linz, Lens → RC Lens,
  -- Paris Saint-Germain → PSG, Porto → FC Porto, Roma → AS Roma,
  -- Sabah → Sabah FK, Stuttgart → VfB Stuttgart, Viking → Viking FK.
  for rec in
    select * from (values
      ('AEK Athen',          'Bob',        43),
      ('Arsenal',            'Mortensen', 245),
      ('Aston Villa',        'Mortensen',  93),
      ('Atlético Madrid',    'Mortensen', 135),
      ('Barcelona',          'Bruun',     241),
      ('Bayern München',     'Mortensen', 245),
      ('Bodø/Glimt',         'Bruun',      60),
      ('Borussia Dortmund',  'Engbjerg',  112),
      ('Club Brugge',        'Bruun',      69),
      ('Como',               'Bob',       107),
      ('Fenerbahçe',         'Engbjerg',   70),
      ('Feyenoord',          'Bob',        58),
      ('Galatasaray',        'Bruun',      58),
      ('Inter',              'Engbjerg',  149),
      ('LASK Linz',          'Bruun',      57),
      ('RB Leipzig',         'Bob',        92),
      ('RC Lens',            'Engbjerg',   83),
      ('Lille',              'Engbjerg',   74),
      ('Liverpool',          'Bob',        47),
      ('Manchester City',    'Bob',       212),
      ('Manchester United',  'Bob',       155),
      ('Napoli',             'Bruun',     134),
      ('PSG',                'Engbjerg',  249),
      ('FC Porto',           'Bruun',     104),
      ('PSV',                'Bruun',      79),
      ('Real Betis',         'Mortensen',  81),
      ('Real Madrid',        'Engbjerg',  229),
      ('AS Roma',            'Mortensen',  94),
      ('Sabah FK',           'Engbjerg',   34),
      ('Shakhtar Donetsk',   'Bob',        53),
      ('Slavia Praha',       'Bruun',      24),
      ('Slovan Bratislava',  'Bruun',      23),
      ('Sporting CP',        'Mortensen',  87),
      ('VfB Stuttgart',      'Bruun',     105),
      ('Viking FK',          'Bob',        41),
      ('Villarreal',         'Bob',        73)
    ) as r(catalog_name, player_name, price)
  loop
    select id into v_team
    from public.teams
    where name = rec.catalog_name and tournament_type = 'cl2627'
    limit 1;
    if v_team is null then raise exception 'Ukendt hold i cl2627-katalogen: %', rec.catalog_name; end if;

    select id into v_player from public.players where game_id = v_game and name = rec.player_name limit 1;
    if v_player is null then raise exception 'Ukendt spiller: %', rec.player_name; end if;

    -- Sæt ejerskab
    update public.game_teams
    set owner_player_id = v_player
    where game_id = v_game and team_id = v_team;

    -- Indsæt vinder-bud (så pris/ROI vises i bud-, point- og summary-oversigt).
    -- team_name skal være katalognavnet for at matche oversigterne.
    -- Én runde pr. hold; created_at følger rækkefølgen i listen ovenfor.
    v_order := v_order + 1;
    insert into public.auction_room_bids (player_id, team_name, amount, game_id, round_id, bid_phase, created_at)
    values (v_player, rec.catalog_name, rec.price, v_game, gen_random_uuid(), 1, now() + (v_order || ' seconds')::interval);
  end loop;

  -- Kontrol 1: alle 36 hold skal have en ejer
  select string_agg(t.name, ', ' order by t.name) into v_problem
  from public.game_teams gt join public.teams t on t.id = gt.team_id
  where gt.game_id = v_game and gt.owner_player_id is null;
  if v_problem is not null then
    raise exception 'Hold uden ejer efter import: %', v_problem;
  end if;

  -- Kontrol 2: brugt + rest skal give 1000 mønter pr. spiller
  select string_agg(x.name || ' (' || x.spent || ' + ' || x.coins || ')', ', ') into v_problem
  from (
    select p.name, p.coins, coalesce(sum(b.amount), 0) as spent
    from public.players p
    left join public.auction_room_bids b on b.player_id = p.id
    where p.game_id = v_game
    group by p.id, p.name, p.coins
  ) x
  where x.spent + x.coins <> 1000;
  if v_problem is not null then
    raise exception 'Budget går ikke op (brugt + rest <> 1000): %', v_problem;
  end if;

  raise notice 'OK — spil "%" oprettet. Invitationskode: %  (game_id: %)', c_label, v_code, v_game;
end $$;

-- Invitationskode + admin-nøgle til deling
select label, invite_code, admin_secret, tournament_type, created_at
from public.games
where tournament_type = 'cl2627' and label = 'CL 26/27'
order by created_at desc
limit 1;

-- Kontroloversigt: trup, forbrug og rest pr. spiller
select p.name,
       (select count(*) from public.game_teams gt
         where gt.game_id = p.game_id and gt.owner_player_id = p.id)          as hold,
       (select coalesce(sum(b.amount), 0) from public.auction_room_bids b
         where b.player_id = p.id)                                           as brugt,
       p.coins                                                               as rest,
       (select coalesce(sum(b.amount), 0) from public.auction_room_bids b
         where b.player_id = p.id) + p.coins                                 as ialt
from public.players p
join public.games g on g.id = p.game_id
where g.tournament_type = 'cl2627' and g.label = 'CL 26/27'
order by brugt desc;

-- rollback;
