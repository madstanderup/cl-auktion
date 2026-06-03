/*
  KØR DENNE ÉN GANG i Supabase SQL Editor.
  Full fix inkl. tie-breaker + admin RPC-funktioner.
*/

create table if not exists public.auction_state (
  id uuid primary key default gen_random_uuid (),
  current_team_name text,
  status text not null default 'waiting',
  updated_at timestamptz not null default now ()
);

alter table public.auction_state
  add column if not exists current_team_id uuid references public.teams (id) on delete set null,
  add column if not exists current_round_id uuid,
  add column if not exists current_phase integer not null default 0,
  add column if not exists tied_player_ids uuid[],
  add column if not exists tie_break_min_bid integer;

do $status_check$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'auction_state_status_check'
      and conrelid = 'public.auction_state'::regclass
  ) then
    alter table public.auction_state drop constraint auction_state_status_check;
  end if;
end $status_check$;

alter table public.auction_state
  add constraint auction_state_status_check
  check (status in ('waiting', 'bidding', 'revealed', 'tie_breaker'));

insert into public.auction_state (current_team_name, status)
select null, 'waiting'
where not exists (select 1 from public.auction_state);

create table if not exists public.auction_room_bids (
  id uuid primary key default gen_random_uuid (),
  player_id uuid not null references public.players (id) on delete cascade,
  team_name text not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now ()
);

alter table public.auction_room_bids
  add column if not exists round_id uuid,
  add column if not exists bid_phase integer not null default 0;

alter table public.teams
  add column if not exists owner_player_id uuid references public.players (id) on delete set null;

create index if not exists auction_room_bids_player_id_idx on public.auction_room_bids (player_id);
create index if not exists auction_room_bids_team_created_idx on public.auction_room_bids (team_name, created_at desc);
create index if not exists auction_room_bids_round_phase_player_idx
  on public.auction_room_bids (round_id, bid_phase, player_id, created_at desc);

alter table public.auction_state enable row level security;
alter table public.auction_room_bids enable row level security;

drop policy if exists "auction_state_select_all" on public.auction_state;
create policy "auction_state_select_all"
  on public.auction_state for select to anon, authenticated using (true);

drop policy if exists "auction_room_bids_select_all" on public.auction_room_bids;
create policy "auction_room_bids_select_all"
  on public.auction_room_bids for select to anon, authenticated using (true);

drop policy if exists "auction_room_bids_insert_anon" on public.auction_room_bids;
create policy "auction_room_bids_insert_anon"
  on public.auction_room_bids for insert to anon with check (true);

drop policy if exists "auction_room_bids_insert_authenticated" on public.auction_room_bids;
create policy "auction_room_bids_insert_authenticated"
  on public.auction_room_bids for insert to authenticated with check (true);

drop policy if exists "teams_select_all" on public.teams;
create policy "teams_select_all"
on public.teams for select to anon, authenticated using (true);

drop policy if exists "teams_update_all" on public.teams;
create policy "teams_update_all"
on public.teams for update to anon, authenticated using (true);

drop policy if exists "players_update_all" on public.players;
create policy "players_update_all"
on public.players for update to anon, authenticated using (true);

alter table public.auction_state replica identity full;
alter table public.auction_room_bids replica identity full;

create or replace function public.admin_draw_next_team ()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  state_row public.auction_state%rowtype;
  team_row public.teams%rowtype;
  new_round_id uuid := gen_random_uuid();
begin
  select * into state_row
  from public.auction_state
  order by updated_at desc
  limit 1
  for update;

  if not found then
    insert into public.auction_state (status, updated_at)
    values ('waiting', now())
    returning * into state_row;
  end if;

  select * into team_row
  from public.teams t
  where t.owner_player_id is null
  order by random()
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
        updated_at = now()
    where id = state_row.id;

    return jsonb_build_object('ok', true, 'status', 'finished', 'message', 'Ingen hold tilbage uden owner.');
  end if;

  update public.auction_state
  set status = 'bidding',
      current_team_name = team_row.name,
      current_team_id = team_row.id,
      current_round_id = new_round_id,
      current_phase = 0,
      tied_player_ids = null,
      tie_break_min_bid = null,
      updated_at = now()
  where id = state_row.id;

  return jsonb_build_object('ok', true, 'status', 'bidding', 'team_id', team_row.id, 'team_name', team_row.name, 'round_id', new_round_id);
end;
$$;

create or replace function public.admin_reveal_and_find_winner ()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  state_row public.auction_state%rowtype;
  max_bid integer;
  top_count integer;
  tied_ids uuid[];
  winner_id uuid;
  winner_name text;
  affected_rows integer;
begin
  select * into state_row
  from public.auction_state
  order by updated_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'auction_state mangler.');
  end if;
  if state_row.status not in ('bidding', 'tie_breaker') then
    return jsonb_build_object('ok', false, 'error', 'Status skal være bidding eller tie_breaker.');
  end if;
  if state_row.current_round_id is null or state_row.current_team_id is null then
    return jsonb_build_object('ok', false, 'error', 'Nuvaerende runde mangler team/round id.');
  end if;

  with latest_bids as (
    select distinct on (b.player_id) b.player_id, b.amount
    from public.auction_room_bids b
    where b.round_id = state_row.current_round_id
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
    where b.round_id = state_row.current_round_id
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
        updated_at = now()
    where id = state_row.id;
    return jsonb_build_object('ok', true, 'status', 'tie_breaker', 'max_bid', max_bid, 'tied_player_ids', tied_ids);
  end if;

  if top_count > 1 and state_row.status = 'tie_breaker' then
    winner_id := tied_ids[1 + floor(random() * array_length(tied_ids, 1))::integer];
  else
    winner_id := tied_ids[1];
  end if;

  update public.players p
  set coins = p.coins - max_bid
  where p.id = winner_id and p.coins >= max_bid;
  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'Vinderen har ikke nok coins.');
  end if;

  update public.teams
  set owner_player_id = winner_id
  where id = state_row.current_team_id;

  select name into winner_name from public.players where id = winner_id;

  update public.auction_state
  set status = 'waiting',
      current_team_name = null,
      current_team_id = null,
      current_round_id = null,
      current_phase = 0,
      tied_player_ids = null,
      tie_break_min_bid = null,
      updated_at = now()
  where id = state_row.id;

  return jsonb_build_object('ok', true, 'status', 'resolved', 'winner_id', winner_id, 'winner_name', winner_name, 'winning_bid', max_bid);
end;
$$;

grant execute on function public.admin_draw_next_team () to anon, authenticated;
grant execute on function public.admin_reveal_and_find_winner () to anon, authenticated;

create or replace function public.admin_reset_game ()
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
  update public.teams
  set owner_player_id = null
  where owner_player_id is not null;
  get diagnostics reset_teams = row_count;

  /*
    Ryd alle rum-bud. Vi bruger DELETE med WHERE true (gyldigt i PL/pgSQL),
    da TRUNCATE i nogle opsætninger kan fejle på rettigheder/publication.
  */
  select count(*) into deleted_bids from public.auction_room_bids;
  delete from public.auction_room_bids where true;

  update public.players
  set coins = 1000,
      points = 0
  where coins <> 1000 or points <> 0;
  get diagnostics reset_players = row_count;

  update public.auction_state
  set status = 'waiting',
      current_team_name = null,
      current_team_id = null,
      current_round_id = null,
      current_phase = 0,
      tied_player_ids = null,
      tie_break_min_bid = null,
      updated_at = now();
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

grant execute on function public.admin_reset_game () to anon, authenticated;

create or replace function public.admin_delete_player (p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if p_player_id is null then
    return jsonb_build_object('ok', false, 'error', 'player_id mangler');
  end if;

  select name into v_name from public.players where id = p_player_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Spiller findes ikke');
  end if;

  delete from public.players where id = p_player_id;

  return jsonb_build_object('ok', true, 'deleted_id', p_player_id, 'deleted_name', v_name);
end;
$$;

grant execute on function public.admin_delete_player (uuid) to anon, authenticated;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auction_state'
  ) then
    alter publication supabase_realtime add table public.auction_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auction_room_bids'
  ) then
    alter publication supabase_realtime add table public.auction_room_bids;
  end if;
end $pub$;

notify pgrst, 'reload schema';
