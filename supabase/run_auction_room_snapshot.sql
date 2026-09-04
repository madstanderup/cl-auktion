-- Ét kald i stedet for ti.
--
-- Auktionssiden byggede sit billede af rummet af tre loaders, der tilsammen
-- lavede 10 REST-kald per refresh — og to af dem hentede BEGGE game_teams og
-- teams. Med mange aabne faner blev det til tusindvis af requests i minuttet.
-- Denne funktion samler hele rummets tilstand i én jsonb, saa klienten kan
-- noejes med ét round-trip.
--
-- Bemaerk: sorteringen af holdnavne sker fortsat i klienten (localeCompare
-- "da"), saa æ/ø/å lander samme sted som foer uanset databasens collation.

-- Countet paa players filtrerede paa game_id uden et indeks der ledte med den
-- kolonne (players_user_id_game_id_idx har user_id foerst).
create index if not exists players_game_id_idx on public.players (game_id);

create or replace function public.get_auction_room_snapshot (
  p_game_id uuid,
  p_round_id uuid default null,
  p_bid_phase integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'teamsTotal', (
      select count(*) from public.game_teams gt where gt.game_id = p_game_id
    ),
    'teamsWithoutOwner', (
      select count(*) from public.game_teams gt
      where gt.game_id = p_game_id
        and gt.owner_player_id is null
        and gt.withdrawn = false
    ),
    'playersTotal', (
      select count(*) from public.players p where p.game_id = p_game_id
    ),
    -- Unikke buddere: et rebud indsaetter en NY raekke, saa count(*) ville
    -- taelle samme spiller flere gange.
    'bidderIds', coalesce((
      select jsonb_agg(distinct b.player_id)
      from public.auction_room_bids b
      where p_round_id is not null
        and b.game_id = p_game_id
        and b.round_id = p_round_id
        and b.bid_phase = p_bid_phase
    ), '[]'::jsonb),
    'ownership', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'playerId', p.id,
          'playerName', p.name,
          'coins', p.coins,
          'teams', coalesce((
            select jsonb_agg(t.name)
            from public.game_teams gt
            join public.teams t on t.id = gt.team_id
            where gt.game_id = p_game_id and gt.owner_player_id = p.id
          ), '[]'::jsonb)
        )
        order by p.name
      )
      from public.players p
      where p.game_id = p_game_id
    ), '[]'::jsonb),
    -- left join paa teams: en raekke med ukendt hold skal stadig vises (som "?"),
    -- praecis som klientens gamle opslag gjorde.
    'teamList', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'teamId', gt.team_id,
          'name', coalesce(t.name, '?'),
          'ownerName', case
            when gt.owner_player_id is null then null
            else coalesce(o.name, '?')
          end,
          'withdrawn', gt.withdrawn
        )
      )
      from public.game_teams gt
      left join public.teams t on t.id = gt.team_id
      left join public.players o on o.id = gt.owner_player_id
      where gt.game_id = p_game_id
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_auction_room_snapshot (uuid, uuid, integer) to anon, authenticated;
