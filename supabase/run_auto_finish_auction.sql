-- Auktionen afslutter sig selv naar sidste hold er afgjort.
--
-- Foer skulle vaerten trykke "Afslut auktion" manuelt. Blev det sidste hold
-- tildelt eller udgik det, satte reveal status tilbage til 'waiting', og
-- auktionen blev bare staaende — ogsaa selvom der ikke var mere at byde paa.
--
-- Baade tildelings- og udgaaelses-grenen taeller nu aabne hold bagefter
-- (uejede og ikke udgaaede) og saetter 'finished' hvis der ingen er.
-- Banneret vises stadig: klienten ser paa resolution_until, ikke paa status,
-- saa de sidste 10 sekunders visning gaar ikke tabt.

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
  -- Antal runder med 0 fra alle, foer holdet udgaar.
  zero_rounds_limit constant integer := 3;
  state_row public.auction_state%rowtype;
  max_bid integer;
  winner_id uuid;
  winner_name text;
  top_count integer;
  tied_ids uuid[];
  affected_rows integer;
  winner_game uuid;
  expected_bidders integer;
  actual_bidders integer;
  zero_rounds_done integer;
  open_teams_left integer;
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
      select distinct on (b.player_id) b.player_id
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
    select distinct on (b.player_id) b.player_id, b.amount
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
  select max(amount) into max_bid from latest_bids;

  if max_bid is null then
    return jsonb_build_object('ok', false, 'error', 'Ingen bud fundet for nuvaerende fase.');
  end if;

  with latest_bids as (
    select distinct on (b.player_id) b.player_id, b.amount
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

  -- ── Ingen vil have holdet ───────────────────────────────────────────
  -- Bud kan ikke vaere negative, saa max_bid = 0 betyder at ALLE bød 0.
  -- current_phase er 0-indekseret, saa fase 0/1/2 er runde 1/2/3.
  if max_bid = 0 then
    zero_rounds_done := state_row.current_phase + 1;

    if zero_rounds_done >= zero_rounds_limit then
      update public.game_teams
      set withdrawn = true
      where game_id = p_game_id
        and team_id = state_row.current_team_id;

      select count(*)::integer into open_teams_left
      from public.game_teams
      where game_id = p_game_id
        and owner_player_id is null
        and withdrawn = false;

      update public.auction_state
      set status = case when open_teams_left = 0 then 'finished' else 'waiting' end,
          current_team_name = null,
          current_team_id = null,
          current_round_id = null,
          current_phase = 0,
          tied_player_ids = null,
          tie_break_min_bid = null,
          resolution_team_name = state_row.current_team_name,
          resolution_winner_name = null,
          resolution_winning_bid = null,
          resolution_withdrawn = true,
          resolution_until = now () + interval '10 seconds',
          updated_at = now ()
      where id = state_row.id;

      return jsonb_build_object(
        'ok', true,
        'status', 'withdrawn',
        'team_name', state_row.current_team_name,
        'zero_rounds', zero_rounds_done,
        'auction_finished', open_teams_left = 0
      );
    end if;

    -- Endnu en runde paa samme hold. Alle bød 0, saa alle er "uafgjorte" og
    -- maa byde igen; minimum bliver 0, saa det stadig er gratis at sige nej.
    update public.auction_state
    set status = 'tie_breaker',
        tied_player_ids = tied_ids,
        tie_break_min_bid = 0,
        current_phase = state_row.current_phase + 1,
        resolution_team_name = null,
        resolution_winner_name = null,
        resolution_winning_bid = null,
        resolution_withdrawn = false,
        resolution_until = null,
        updated_at = now ()
    where id = state_row.id;

    return jsonb_build_object(
      'ok', true,
      'status', 'tie_breaker',
      'max_bid', 0,
      'zero_rounds', zero_rounds_done,
      'tied_player_ids', tied_ids
    );
  end if;

  -- ── Almindeligt uafgjort paa et bud over 0 (uaendret opfoersel) ──────
  if top_count > 1 and state_row.status = 'bidding' then
    update public.auction_state
    set status = 'tie_breaker',
        tied_player_ids = tied_ids,
        tie_break_min_bid = max_bid,
        current_phase = state_row.current_phase + 1,
        resolution_team_name = null,
        resolution_winner_name = null,
        resolution_winning_bid = null,
        resolution_withdrawn = false,
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
    winner_id := tied_ids[1 + floor(random () * array_length(tied_ids, 1))::integer];
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
    return jsonb_build_object('ok', false, 'error', 'Vinderen har ikke nok coins til buddet.');
  end if;

  update public.game_teams gt
  set owner_player_id = winner_id
  where gt.game_id = p_game_id
    and gt.team_id = state_row.current_team_id;

  select name into winner_name from public.players where id = winner_id;

  select count(*)::integer into open_teams_left
  from public.game_teams
  where game_id = p_game_id
    and owner_player_id is null
    and withdrawn = false;

  update public.auction_state
  set status = case when open_teams_left = 0 then 'finished' else 'waiting' end,
      current_team_name = null,
      current_team_id = null,
      current_round_id = null,
      current_phase = 0,
      tied_player_ids = null,
      tie_break_min_bid = null,
      resolution_team_name = state_row.current_team_name,
      resolution_winner_name = winner_name,
      resolution_winning_bid = max_bid,
      resolution_withdrawn = false,
      resolution_until = now () + interval '10 seconds',
      updated_at = now ()
  where id = state_row.id;

  return jsonb_build_object(
    'ok', true,
    'status', 'resolved',
    'winner_id', winner_id,
    'winner_name', winner_name,
    'winning_bid', max_bid,
    'auction_finished', open_teams_left = 0
  );
end;
$$;

grant execute on function public.reveal_auction_round_for_game (uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
