-- Flere parallelle auktionsspil: games + game_teams (ejerskab per spil), spillere og auktionstilstand knyttet til game_id.
-- Eksisterende data migreres til ét "standard"-spil med invite-kode DEFAULT (giv den til spillere der skal fortsætte det gamle spil).

-- 1) games
create table if not exists public.games (
  id uuid primary key default gen_random_uuid (),
  invite_code text not null,
  label text,
  admin_secret uuid not null default gen_random_uuid (),
  created_at timestamptz not null default now (),
  constraint games_invite_code_upper_chk check (invite_code = upper (invite_code))
);

create unique index if not exists games_invite_code_key on public.games (invite_code);

alter table public.games enable row level security;

drop policy if exists "games_select_all" on public.games;
create policy "games_select_all"
on public.games for select to anon, authenticated using (true);

-- 2) game_teams (hold-pulje pr. spil; catalog teams.id genbruges)
create table if not exists public.game_teams (
  id uuid primary key default gen_random_uuid (),
  game_id uuid not null references public.games (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  owner_player_id uuid references public.players (id) on delete set null,
  unique (game_id, team_id)
);

create index if not exists game_teams_game_available_idx
  on public.game_teams (game_id)
  where owner_player_id is null;

alter table public.game_teams enable row level security;

drop policy if exists "game_teams_select_all" on public.game_teams;
create policy "game_teams_select_all"
on public.game_teams for select to anon, authenticated using (true);

-- 3) spillere → game_id
alter table public.players
  add column if not exists game_id uuid references public.games (id) on delete cascade;

-- 4) Opret standard-spil og migrér
do $$
declare
  legacy_id uuid;
begin
  select id into legacy_id from public.games where invite_code = 'DEFAULT' limit 1;
  if legacy_id is null then
    insert into public.games (invite_code, label)
    values ('DEFAULT', 'Migreret / standard-spil')
    returning id into legacy_id;
  end if;

  update public.players set game_id = legacy_id where game_id is null;

  insert into public.game_teams (game_id, team_id, owner_player_id)
  select legacy_id, t.id, t.owner_player_id
  from public.teams t
  on conflict (game_id, team_id) do nothing;

  insert into public.game_teams (game_id, team_id)
  select legacy_id, t.id
  from public.teams t
  where not exists (
    select 1 from public.game_teams gt
    where gt.game_id = legacy_id and gt.team_id = t.id
  );

  update public.teams set owner_player_id = null where owner_player_id is not null;
end $$;

alter table public.players alter column game_id set not null;

-- 5) auction_state: én række pr. spil
alter table public.auction_state
  add column if not exists game_id uuid references public.games (id) on delete cascade;

do $$
declare
  legacy_id uuid;
begin
  select id into legacy_id from public.games where invite_code = 'DEFAULT' limit 1;

  with ranked as (
    select id,
      row_number() over (
        order by updated_at desc nulls last, id
      ) as rn
    from public.auction_state
    where game_id is null
  )
  delete from public.auction_state
  where id in (select id from ranked where rn > 1);

  update public.auction_state set game_id = legacy_id where game_id is null;

  insert into public.auction_state (game_id, status, updated_at)
  select legacy_id, 'waiting', now ()
  where not exists (
    select 1 from public.auction_state where game_id = legacy_id
  );
end $$;

alter table public.auction_state alter column game_id set not null;

create unique index if not exists auction_state_one_row_per_game
  on public.auction_state (game_id);

-- 6) Bud pr. spil
alter table public.auction_room_bids
  add column if not exists game_id uuid references public.games (id) on delete cascade;

update public.auction_room_bids b
set game_id = p.game_id
from public.players p
where b.player_id = p.id and b.game_id is null;

alter table public.auction_room_bids alter column game_id set not null;

create index if not exists auction_room_bids_game_round_idx
  on public.auction_room_bids (game_id, round_id, bid_phase);

-- 7) Realtime til game_teams (ejerskabs-oversigt)
alter table public.game_teams replica identity full;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_teams'
  ) then
    alter publication supabase_realtime add table public.game_teams;
  end if;
end $pub$;

-- 8) Erstat admin-RPC’er (game + hemmelig nøgle)

drop function if exists public.admin_draw_next_team ();
drop function if exists public.admin_reveal_and_find_winner ();
drop function if exists public.admin_reset_game ();
drop function if exists public.admin_delete_player (uuid);

create or replace function public.create_game (p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  code text;
  attempts integer := 0;
begin
  loop
    attempts := attempts + 1;
    if attempts > 80 then
      return jsonb_build_object('ok', false, 'error', 'Kunne ikke generere unik invitationskode.');
    end if;
    code := upper(substr(replace(gen_random_uuid ()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.games where invite_code = code);
  end loop;

  insert into public.games (invite_code, label)
  values (code, p_label)
  returning * into g;

  insert into public.game_teams (game_id, team_id)
  select g.id, t.id from public.teams t;

  insert into public.auction_state (game_id, status, updated_at)
  values (g.id, 'waiting', now ());

  return jsonb_build_object(
    'ok', true,
    'game_id', g.id,
    'invite_code', g.invite_code,
    'admin_secret', g.admin_secret,
    'label', g.label
  );
end;
$$;

grant execute on function public.create_game (text) to anon, authenticated;

create or replace function public.admin_draw_next_team (
  p_game_id uuid,
  p_admin_secret uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  state_row public.auction_state%rowtype;
  team_row public.teams%rowtype;
  new_round_id uuid := gen_random_uuid ();
begin
  if not exists (
    select 1 from public.games g
    where g.id = p_game_id and g.admin_secret = p_admin_secret
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ugyldigt spil eller admin-nøgle.');
  end if;

  select * into state_row
  from public.auction_state
  where game_id = p_game_id
  for update;

  if not found then
    insert into public.auction_state (game_id, status, updated_at)
    values (p_game_id, 'waiting', now ())
    returning * into state_row;
  end if;

  select t.*
  into team_row
  from public.game_teams gt
  join public.teams t on t.id = gt.team_id
  where gt.game_id = p_game_id
    and gt.owner_player_id is null
  order by random ()
  limit 1;

  if not found then
    update public.auction_state
    set status = 'waiting',
        current_team_name = null,
        current_team_id = null,
        current_round_id = null,
        current_phase = 0,
        tied_player_ids = null,
        tie_break_min_bid = null,
        updated_at = now ()
    where id = state_row.id;

    return jsonb_build_object(
      'ok', true,
      'status', 'finished',
      'message', 'Ingen hold tilbage uden owner.'
    );
  end if;

  update public.auction_state
  set status = 'bidding',
      current_team_name = team_row.name,
      current_team_id = team_row.id,
      current_round_id = new_round_id,
      current_phase = 0,
      tied_player_ids = null,
      tie_break_min_bid = null,
      updated_at = now ()
  where id = state_row.id;

  return jsonb_build_object(
    'ok', true,
    'status', 'bidding',
    'team_id', team_row.id,
    'team_name', team_row.name,
    'round_id', new_round_id
  );
end;
$$;

create or replace function public.admin_reveal_and_find_winner (
  p_game_id uuid,
  p_admin_secret uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  state_row public.auction_state%rowtype;
  max_bid integer;
  winner_id uuid;
  winner_name text;
  top_count integer;
  tied_ids uuid[];
  picked_winner uuid;
  affected_rows integer;
  winner_game uuid;
begin
  if not exists (
    select 1 from public.games g
    where g.id = p_game_id and g.admin_secret = p_admin_secret
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ugyldigt spil eller admin-nøgle.');
  end if;

  select * into state_row
  from public.auction_state
  where game_id = p_game_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'auction_state mangler.');
  end if;

  if state_row.status not in ('bidding', 'tie_breaker') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Status skal være bidding eller tie_breaker for at afsløre.'
    );
  end if;

  if state_row.current_round_id is null or state_row.current_team_id is null then
    return jsonb_build_object('ok', false, 'error', 'Nuvaerende runde mangler team/round id.');
  end if;

  with latest_bids as (
    select distinct on (b.player_id)
      b.player_id,
      b.amount
    from public.auction_room_bids b
    where b.game_id = p_game_id
      and b.round_id = state_row.current_round_id
      and b.bid_phase = state_row.current_phase
      and (
        state_row.status <> 'tie_breaker'
        or (state_row.tied_player_ids is not null and b.player_id = any (state_row.tied_player_ids))
      )
    order by b.player_id, b.created_at desc
  )
  select max(amount)
  into max_bid
  from latest_bids;

  if max_bid is null then
    return jsonb_build_object('ok', false, 'error', 'Ingen bud fundet for nuvaerende fase.');
  end if;

  with latest_bids as (
    select distinct on (b.player_id)
      b.player_id,
      b.amount
    from public.auction_room_bids b
    where b.game_id = p_game_id
      and b.round_id = state_row.current_round_id
      and b.bid_phase = state_row.current_phase
      and (
        state_row.status <> 'tie_breaker'
        or (state_row.tied_player_ids is not null and b.player_id = any (state_row.tied_player_ids))
      )
    order by b.player_id, b.created_at desc
  )
  select count(*), array_agg(player_id order by player_id)
  into top_count, tied_ids
  from latest_bids
  where amount = max_bid;

  if top_count > 1 and state_row.status = 'bidding' then
    update public.auction_state
    set status = 'tie_breaker',
        tied_player_ids = tied_ids,
        tie_break_min_bid = max_bid,
        current_phase = state_row.current_phase + 1,
        updated_at = now ()
    where id = state_row.id;

    return jsonb_build_object(
      'ok', true,
      'status', 'tie_breaker',
      'max_bid', max_bid,
      'tied_player_ids', tied_ids
    );
  end if;

  if top_count > 1 and state_row.status = 'tie_breaker' then
    picked_winner := tied_ids[1 + floor(random () * array_length(tied_ids, 1))::integer];
    winner_id := picked_winner;
  else
    winner_id := tied_ids[1];
  end if;

  select game_id into winner_game from public.players where id = winner_id;
  if winner_game is distinct from p_game_id then
    return jsonb_build_object('ok', false, 'error', 'Vinder tilhører ikke dette spil.');
  end if;

  update public.players p
  set coins = p.coins - max_bid
  where p.id = winner_id
    and p.game_id = p_game_id
    and p.coins >= max_bid;
  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Vinderen har ikke nok coins til buddet.'
    );
  end if;

  update public.game_teams gt
  set owner_player_id = winner_id
  where gt.game_id = p_game_id
    and gt.team_id = state_row.current_team_id;

  select name into winner_name from public.players where id = winner_id;

  update public.auction_state
  set status = 'waiting',
      current_team_name = null,
      current_team_id = null,
      current_round_id = null,
      current_phase = 0,
      tied_player_ids = null,
      tie_break_min_bid = null,
      updated_at = now ()
  where id = state_row.id;

  return jsonb_build_object(
    'ok', true,
    'status', 'resolved',
    'winner_id', winner_id,
    'winner_name', winner_name,
    'winning_bid', max_bid
  );
end;
$$;

create or replace function public.admin_reset_game (
  p_game_id uuid,
  p_admin_secret uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reset_teams integer := 0;
  deleted_bids integer := 0;
  reset_players integer := 0;
  reset_state integer := 0;
begin
  if not exists (
    select 1 from public.games g
    where g.id = p_game_id and g.admin_secret = p_admin_secret
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ugyldigt spil eller admin-nøgle.');
  end if;

  update public.game_teams
  set owner_player_id = null
  where game_id = p_game_id
    and owner_player_id is not null;
  get diagnostics reset_teams = row_count;

  select count(*) into deleted_bids
  from public.auction_room_bids
  where game_id = p_game_id;

  delete from public.auction_room_bids
  where game_id = p_game_id;

  update public.players
  set coins = 1000,
      points = 0
  where game_id = p_game_id
    and (coins <> 1000 or points <> 0);
  get diagnostics reset_players = row_count;

  update public.auction_state
  set status = 'waiting',
      current_team_name = null,
      current_team_id = null,
      current_round_id = null,
      current_phase = 0,
      tied_player_ids = null,
      tie_break_min_bid = null,
      updated_at = now ()
  where game_id = p_game_id;
  get diagnostics reset_state = row_count;

  return jsonb_build_object(
    'ok', true,
    'reset_teams', reset_teams,
    'deleted_bids', deleted_bids,
    'reset_players', reset_players,
    'reset_state_rows', reset_state
  );
end;
$$;

create or replace function public.admin_delete_player (
  p_player_id uuid,
  p_game_id uuid,
  p_admin_secret uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if p_player_id is null or p_game_id is null or p_admin_secret is null then
    return jsonb_build_object('ok', false, 'error', 'Manglende parametre');
  end if;

  if not exists (
    select 1 from public.games g
    where g.id = p_game_id and g.admin_secret = p_admin_secret
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ugyldigt spil eller admin-nøgle.');
  end if;

  select name into v_name
  from public.players
  where id = p_player_id and game_id = p_game_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Spiller findes ikke i dette spil');
  end if;

  delete from public.players where id = p_player_id;

  return jsonb_build_object('ok', true, 'deleted_id', p_player_id, 'deleted_name', v_name);
end;
$$;

grant execute on function public.admin_draw_next_team (uuid, uuid) to anon, authenticated;
grant execute on function public.admin_reveal_and_find_winner (uuid, uuid) to anon, authenticated;
grant execute on function public.admin_reset_game (uuid, uuid) to anon, authenticated;
grant execute on function public.admin_delete_player (uuid, uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
