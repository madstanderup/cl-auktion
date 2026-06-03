-- Vinder vises synkront for alle: felter på auction_state i 10 sek. (klient skjuler efter resolution_until).

alter table public.auction_state
  add column if not exists resolution_team_name text,
  add column if not exists resolution_winner_name text,
  add column if not exists resolution_winning_bid integer,
  add column if not exists resolution_until timestamptz;

create or replace function public.reveal_auction_round_for_game (
  p_game_id uuid,
  p_require_all_bids boolean default true
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
  expected_bidders integer;
  actual_bidders integer;
begin
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

  if p_require_all_bids then
    if state_row.status = 'bidding' then
      select count(*)::integer into expected_bidders
      from public.players p
      where p.game_id = p_game_id;
    else
      expected_bidders := coalesce(array_length(state_row.tied_player_ids, 1), 0);
    end if;

    if expected_bidders <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'no_players');
    end if;

    with latest_bids as (
      select distinct on (b.player_id)
        b.player_id
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
    select count(*)::integer into actual_bidders from latest_bids;

    if actual_bidders < expected_bidders then
      return jsonb_build_object('ok', false, 'reason', 'awaiting_bids');
    end if;
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
        resolution_team_name = null,
        resolution_winner_name = null,
        resolution_winning_bid = null,
        resolution_until = null,
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
      resolution_team_name = state_row.current_team_name,
      resolution_winner_name = winner_name,
      resolution_winning_bid = max_bid,
      resolution_until = now () + interval '10 seconds',
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
        resolution_team_name = null,
        resolution_winner_name = null,
        resolution_winning_bid = null,
        resolution_until = null,
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
      resolution_team_name = null,
      resolution_winner_name = null,
      resolution_winning_bid = null,
      resolution_until = null,
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
      resolution_team_name = null,
      resolution_winner_name = null,
      resolution_winning_bid = null,
      resolution_until = null,
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

notify pgrst, 'reload schema';
