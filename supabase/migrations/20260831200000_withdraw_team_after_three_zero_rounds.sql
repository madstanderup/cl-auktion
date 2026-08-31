-- Hold uden interesse skal udgaa i stedet for at blokere auktionen.
--
-- Naar alle spillere byder 0, er der ingen at bryde uafgjort mellem: minimum i
-- omauktionen saettes til det hoejeste bud, altsaa 0, og saa kan alle byde 0
-- igen. Spillere uden moenter byder desuden automatisk 0. Er alle loebet toer,
-- kan ingen bryde den, og fasen taeller op i det uendelige.
--
-- Det skete i praksis: et spil naaede fase 420 paa det samme hold og skrev
-- ~3,5 bud i sekundet indtil databasen gav op med 503.
--
-- Reglen er nu: byder alle 0 tre runder i traek, udgaar holdet og tildeles
-- ingen. Almindelige uafgjorte bud (to spillere paa 50) er uaendrede — de
-- afgoeres som foer, og efter anden omgang ved lodtraekning.

-- 1) Et udgaaet hold er ikke det samme som et usolgt hold. Uden det egne felt
--    ville det blive trukket igen og forhindre at auktionen kan blive faerdig.
alter table public.game_teams
  add column if not exists withdrawn boolean not null default false;

create index if not exists game_teams_game_open_idx
  on public.game_teams (game_id)
  where owner_player_id is null and withdrawn = false;

-- 2) Banneret skal kunne sige "ingen bud" og ikke kun "X vandt".
alter table public.auction_state
  add column if not exists resolution_withdrawn boolean not null default false;

-- 3) Traek aldrig et udgaaet hold igen.
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
    and gt.withdrawn = false
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
        resolution_withdrawn = false,
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
      resolution_withdrawn = false,
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

grant execute on function public.admin_draw_next_team (uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- 4) Selve reglen.
--
-- BEMAERK: funktionen skrives her komplet, ikke som en aendring af den
-- eksisterende. Databasen kørte en aeldre udgave end nogen af versionerne i
-- migrations/ — den taeller fasen op ogsaa naar status allerede er
-- 'tie_breaker', og dét er praecis hvad der gjorde løkken uendelig. Ved at
-- definere hele kroppen her forsvinder afvigelsen.
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

      update public.auction_state
      set status = 'waiting',
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
        'zero_rounds', zero_rounds_done
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
      resolution_withdrawn = false,
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

grant execute on function public.reveal_auction_round_for_game (uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
