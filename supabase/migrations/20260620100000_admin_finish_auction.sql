-- Afslut auktion: sætter auction_state.status = 'finished' for et spil.
-- Manglede i databasen — "Afslut auktion"-knappen kaldte en ikke-eksisterende RPC.

-- 1) Udvid status-constraint til at tillade 'finished' (idempotent)
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

-- 2) RPC
create or replace function public.admin_finish_auction (
  p_game_id uuid,
  p_admin_secret uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  if p_game_id is null or p_admin_secret is null then
    return jsonb_build_object('ok', false, 'error', 'Manglende parametre.');
  end if;

  if not exists (
    select 1 from public.games g
    where g.id = p_game_id and g.admin_secret = p_admin_secret
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ugyldigt spil eller admin-nøgle.');
  end if;

  update public.auction_state
  set status = 'finished',
      current_team_name = null,
      current_team_id = null,
      current_round_id = null,
      current_phase = 0,
      tied_player_ids = null,
      tie_break_min_bid = null,
      updated_at = now ()
  where game_id = p_game_id;
  get diagnostics affected = row_count;

  if affected = 0 then
    -- Ingen auction_state-række endnu — opret den som afsluttet
    insert into public.auction_state (game_id, status, updated_at)
    values (p_game_id, 'finished', now ());
  end if;

  return jsonb_build_object('ok', true, 'status', 'finished');
end;
$$;

grant execute on function public.admin_finish_auction (uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
