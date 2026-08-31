-- Auto-bud på 0 mønter skal være idempotent.
--
-- Klienten indsatte buddet direkte, og guarden mod dubletter laa i en ref i
-- React. Den daekker kun een komponent-instans: to faner, to enheder eller en
-- remount indsaetter hver sin raekke. Data viser at det skete i hver eneste
-- runde, ~200 ms mellem de to raekker.
--
-- Dubletterne aendrer ikke hvem der vinder — reveal tager distinct on
-- (player_id) og begge raekker er 0 — men de fik taelleren "bud i runden" til
-- at staa paa 2 af 2 mens kun een spiller havde budt, saa runden aldrig blev
-- afsloert automatisk.
--
-- Insert'en flyttes hertil, hvor unikheden kan haandhaeves atomisk. Manuelle
-- rebud gaar stadig gennem et almindeligt insert og maa gerne give flere
-- raekker — det er kun auto-buddet der skal vaere engangs.

create or replace function public.auto_bid_zero_for_player (
  p_game_id uuid,
  p_player_id uuid,
  p_round_id uuid,
  p_bid_phase integer,
  p_team_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player_coins integer;
  inserted_id uuid;
begin
  -- Laas spilleren, saa to samtidige kald ikke begge kan naa forbi tjekket.
  select coins into player_coins
  from public.players
  where id = p_player_id and game_id = p_game_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Spilleren findes ikke i dette spil.');
  end if;

  if player_coins <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'has_coins');
  end if;

  if exists (
    select 1
    from public.auction_room_bids
    where game_id = p_game_id
      and player_id = p_player_id
      and round_id = p_round_id
      and bid_phase = p_bid_phase
  ) then
    return jsonb_build_object('ok', true, 'reason', 'already_bid');
  end if;

  insert into public.auction_room_bids (game_id, player_id, team_name, amount, round_id, bid_phase)
  values (p_game_id, p_player_id, p_team_name, 0, p_round_id, p_bid_phase)
  returning id into inserted_id;

  return jsonb_build_object('ok', true, 'inserted', true, 'bid_id', inserted_id);
end;
$$;

grant execute on function public.auto_bid_zero_for_player (uuid, uuid, uuid, integer, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
