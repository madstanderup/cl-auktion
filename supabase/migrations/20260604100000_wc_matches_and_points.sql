-- VM 2026 kampresultater og automatisk pointberegning

create table if not exists public.wc_matches (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  zafronix_match_id text,
  home_team text not null,
  away_team text not null,
  home_score integer,
  away_score integer,
  stage text not null check (stage in ('group','round_of_32','round_of_16','quarter_final','semi_final','final')),
  result_type text check (result_type in ('normal_time','extra_time','penalties')),
  status text not null default 'scheduled' check (status in ('scheduled','finished')),
  match_date timestamptz,
  created_at timestamptz not null default now()
);

alter table public.wc_matches enable row level security;

create policy "wc_matches_select_all" on public.wc_matches
  for select to anon, authenticated using (true);

alter table public.wc_matches replica identity full;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wc_matches'
  ) then
    alter publication supabase_realtime add table public.wc_matches;
  end if;
end $pub$;

-- Intern funktion: genberegn point for alle spillere i ét spil.
-- Kald denne efter hvert kampresultat.
create or replace function public.recalculate_game_points(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_player_id uuid;
  v_match_pts  integer;
  v_adv_pts    integer;
  v_win_bonus  integer;
begin
  for v_player_id in
    select id from public.players where game_id = p_game_id
  loop
    -- Kamppoint: sejr/uafgjort/tab pr. hold spilleren ejer
    select coalesce(sum(
      case
        when (m.home_team = t.name and m.home_score > m.away_score)
          or (m.away_team = t.name and m.away_score > m.home_score) then
          case when m.result_type = 'normal_time' then 150 else 50 end
        when m.home_score = m.away_score then 50
        else 0
      end
    ), 0) into v_match_pts
    from public.wc_matches m
    join public.game_teams gt
      on gt.game_id = m.game_id and gt.owner_player_id = v_player_id
    join public.teams t on t.id = gt.team_id
    where m.game_id = p_game_id
      and m.status = 'finished'
      and (m.home_team = t.name or m.away_team = t.name);

    -- Avancement-bonusser: én bonus pr. (hold, fase) — tælles kun én gang selvom
    -- holdet spiller flere kampe i samme fase (gruppespil).
    select coalesce(sum(stage_bonus), 0) into v_adv_pts
    from (
      select distinct gt.team_id, m.stage,
        case m.stage
          when 'round_of_32'  then 100
          when 'round_of_16'  then 200
          when 'quarter_final' then 400
          when 'semi_final'   then 600
          when 'final'        then 800
          else 0
        end as stage_bonus
      from public.wc_matches m
      join public.game_teams gt
        on gt.game_id = m.game_id and gt.owner_player_id = v_player_id
      join public.teams t on t.id = gt.team_id
      where m.game_id = p_game_id
        and m.status = 'finished'
        and m.stage <> 'group'
        and (m.home_team = t.name or m.away_team = t.name)
    ) sb;

    -- Turneringsvinderbonus: +1000 hvis spillerens hold vinder finalen
    select coalesce(count(*) * 1000, 0)::integer into v_win_bonus
    from public.wc_matches m
    join public.game_teams gt
      on gt.game_id = m.game_id and gt.owner_player_id = v_player_id
    join public.teams t on t.id = gt.team_id
    where m.game_id = p_game_id
      and m.stage = 'final'
      and m.status = 'finished'
      and (
        (m.home_team = t.name and m.home_score > m.away_score)
        or (m.away_team = t.name and m.away_score > m.home_score)
      );

    update public.players
    set points = v_match_pts + v_adv_pts + v_win_bonus
    where id = v_player_id;
  end loop;
end;
$$;

-- Admin RPC: tilføj en kamp til spillet
create or replace function public.admin_add_match(
  p_game_id      uuid,
  p_admin_secret uuid,
  p_home_team    text,
  p_away_team    text,
  p_stage        text,
  p_match_date   timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.games where id = p_game_id and admin_secret = p_admin_secret
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ugyldigt spil eller admin-nøgle.');
  end if;

  insert into public.wc_matches(game_id, home_team, away_team, stage, match_date)
  values (p_game_id, p_home_team, p_away_team, p_stage, p_match_date)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'match_id', v_id);
end;
$$;

-- Admin RPC: sæt kampresultat og genberegn point
create or replace function public.admin_set_match_result(
  p_game_id      uuid,
  p_admin_secret uuid,
  p_match_id     uuid,
  p_home_score   integer,
  p_away_score   integer,
  p_result_type  text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.games where id = p_game_id and admin_secret = p_admin_secret
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ugyldigt spil eller admin-nøgle.');
  end if;

  if not exists (
    select 1 from public.wc_matches where id = p_match_id and game_id = p_game_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Kamp ikke fundet i dette spil.');
  end if;

  -- Gruppespilskampe kan ikke slutte på forlænget/straffe
  if p_result_type in ('extra_time','penalties') then
    if exists (
      select 1 from public.wc_matches
      where id = p_match_id and stage = 'group'
    ) then
      return jsonb_build_object('ok', false, 'error', 'Gruppespilskampe kan kun slutte på ordinær tid eller uafgjort.');
    end if;
  end if;

  update public.wc_matches
  set home_score  = p_home_score,
      away_score  = p_away_score,
      result_type = p_result_type,
      status      = 'finished'
  where id = p_match_id;

  perform public.recalculate_game_points(p_game_id);

  return jsonb_build_object('ok', true);
end;
$$;

-- Admin RPC: slet en kamp og genberegn point
create or replace function public.admin_delete_match(
  p_game_id      uuid,
  p_admin_secret uuid,
  p_match_id     uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.games where id = p_game_id and admin_secret = p_admin_secret
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ugyldigt spil eller admin-nøgle.');
  end if;

  delete from public.wc_matches where id = p_match_id and game_id = p_game_id;

  perform public.recalculate_game_points(p_game_id);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_add_match(uuid, uuid, text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.admin_set_match_result(uuid, uuid, uuid, integer, integer, text) to anon, authenticated;
grant execute on function public.admin_delete_match(uuid, uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
