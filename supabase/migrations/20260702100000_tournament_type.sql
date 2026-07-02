-- Multi-turnering fundament: games og teams får en tournament_type.
-- Alle eksisterende rækker forbliver 'wc2026' — ingen adfærdsændring for
-- eksisterende spil.

alter table public.games
  add column if not exists tournament_type text not null default 'wc2026';

alter table public.teams
  add column if not exists tournament_type text not null default 'wc2026';

create index if not exists teams_tournament_type_idx on public.teams (tournament_type);
create index if not exists games_tournament_type_idx on public.games (tournament_type);

-- Kanonisk create_game: dropper gamle overloads (2-arg versionen findes kun i
-- den live DB) og opretter én funktion med tournament_type (default wc2026),
-- der kun seeder holdpuljen med den valgte turnerings hold.
drop function if exists public.create_game (text);
drop function if exists public.create_game (text, uuid);
drop function if exists public.create_game (text, uuid, text);

create or replace function public.create_game (
  p_label text default null,
  p_created_by uuid default null,
  p_tournament_type text default 'wc2026'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  code text;
  attempts integer := 0;
  seeded integer := 0;
begin
  if p_tournament_type is null or p_tournament_type = '' then
    p_tournament_type := 'wc2026';
  end if;

  if not exists (select 1 from public.teams t where t.tournament_type = p_tournament_type) then
    return jsonb_build_object('ok', false, 'error', 'Ingen hold i kataloget for turneringen: ' || p_tournament_type);
  end if;

  loop
    attempts := attempts + 1;
    if attempts > 80 then
      return jsonb_build_object('ok', false, 'error', 'Kunne ikke generere unik invitationskode.');
    end if;
    code := upper(substr(replace(gen_random_uuid ()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.games where invite_code = code);
  end loop;

  insert into public.games (invite_code, label, created_by, tournament_type)
  values (code, p_label, p_created_by, p_tournament_type)
  returning * into g;

  insert into public.game_teams (game_id, team_id)
  select g.id, t.id from public.teams t
  where t.tournament_type = p_tournament_type;
  get diagnostics seeded = row_count;

  insert into public.auction_state (game_id, status, updated_at)
  values (g.id, 'waiting', now ());

  return jsonb_build_object(
    'ok', true,
    'game_id', g.id,
    'invite_code', g.invite_code,
    'admin_secret', g.admin_secret,
    'label', g.label,
    'tournament_type', g.tournament_type,
    'teams_seeded', seeded
  );
end;
$$;

grant execute on function public.create_game (text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
