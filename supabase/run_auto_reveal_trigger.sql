-- Kør hele filen i Supabase SQL Editor (samme som migrations/20260416120000_auto_reveal_and_rebid.sql).

-- Auto-afslør når alle påkrævede spillere har budt (trigger efter nyt bud).
-- Admin kan stadig afsløre manuelt før alle har budt (p_require_all_bids = false).
-- Flere bud fra samme spiller i samme fase: seneste tæller (som før).

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

create or replace function public.admin_reveal_and_find_winner (
  p_game_id uuid,
  p_admin_secret uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.games g
    where g.id = p_game_id and g.admin_secret = p_admin_secret
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ugyldigt spil eller admin-nøgle.');
  end if;

  return public.reveal_auction_round_for_game (p_game_id, false);
end;
$$;

create or replace function public.trg_auction_room_bids_try_auto_reveal ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reveal_auction_round_for_game (new.game_id, true);
  return new;
end;
$$;

drop trigger if exists trg_auction_room_bids_auto_reveal on public.auction_room_bids;

create trigger trg_auction_room_bids_auto_reveal
after insert on public.auction_room_bids
for each row
execute procedure public.trg_auction_room_bids_try_auto_reveal ();

notify pgrst, 'reload schema';
