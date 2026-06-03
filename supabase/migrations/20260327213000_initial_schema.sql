-- Champions League auktion + fantasy: initial schema
-- RLS: tilføjes i senere migration før produktion.

-- === enums ===
create type public.lobby_status as enum ('draft', 'auction', 'tournament', 'finished');
create type public.lobby_role as enum ('player', 'admin');
create type public.auction_draw_status as enum (
  'pending',
  'bidding',
  'revealed',
  'tiebreak',
  'resolved'
);
create type public.match_status as enum ('scheduled', 'completed');
create type public.match_round as enum (
  'group',
  'r16',
  'qf',
  'sf',
  'final'
);
create type public.fantasy_point_reason as enum (
  'match_win_90',
  'match_win_et_or_pens',
  'match_draw',
  'match_loss',
  'advance_r16',
  'advance_qf',
  'advance_sf',
  'advance_final',
  'tournament_winner'
);

-- === core ===
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.lobbies (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  slug text unique,
  status public.lobby_status not null default 'draft',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.lobby_members (
  id uuid primary key default gen_random_uuid (),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.lobby_role not null default 'player',
  coins_remaining integer not null default 1000 check (coins_remaining >= 0),
  joined_at timestamptz not null default now(),
  unique (lobby_id, user_id)
);

create index lobby_members_lobby_id_idx on public.lobby_members (lobby_id);
create index lobby_members_user_id_idx on public.lobby_members (user_id);

create table public.teams (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  short_name text not null,
  logo_url text,
  sort_seed integer
);

-- === auction ===
create table public.auction_draws (
  id uuid primary key default gen_random_uuid (),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  draw_order integer not null check (draw_order > 0),
  status public.auction_draw_status not null default 'pending',
  current_tiebreak_phase integer not null default 0 check (current_tiebreak_phase >= 0),
  winner_member_id uuid references public.lobby_members (id) on delete set null,
  resolved_at timestamptz,
  unique (lobby_id, draw_order),
  unique (lobby_id, team_id)
);

create index auction_draws_lobby_id_idx on public.auction_draws (lobby_id);

create table public.bids (
  id uuid primary key default gen_random_uuid (),
  auction_draw_id uuid not null references public.auction_draws (id) on delete cascade,
  lobby_member_id uuid not null references public.lobby_members (id) on delete cascade,
  amount integer not null check (amount > 0),
  phase integer not null default 0 check (phase >= 0),
  submitted_at timestamptz not null default now(),
  unique (auction_draw_id, lobby_member_id, phase)
);

create index bids_auction_draw_id_idx on public.bids (auction_draw_id);

create table public.roster_entries (
  id uuid primary key default gen_random_uuid (),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  lobby_member_id uuid not null references public.lobby_members (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  auction_draw_id uuid not null references public.auction_draws (id) on delete restrict,
  winning_bid_amount integer check (winning_bid_amount is null or winning_bid_amount >= 0),
  unique (lobby_id, team_id)
);

create index roster_entries_lobby_id_idx on public.roster_entries (lobby_id);

-- === matches & points (globale kampe, lobby-specifikke point) ===
create table public.matches (
  id uuid primary key default gen_random_uuid (),
  round public.match_round not null,
  home_team_id uuid not null references public.teams (id) on delete restrict,
  away_team_id uuid not null references public.teams (id) on delete restrict,
  scheduled_at timestamptz,
  status public.match_status not null default 'scheduled',
  check (home_team_id <> away_team_id)
);

create index matches_teams_idx on public.matches (home_team_id, away_team_id);

create table public.match_results (
  match_id uuid primary key references public.matches (id) on delete cascade,
  home_goals integer not null check (home_goals >= 0),
  away_goals integer not null check (away_goals >= 0),
  decided_in_extra_time boolean not null default false,
  decided_on_penalties boolean not null default false,
  recorded_at timestamptz not null default now()
);

create table public.fantasy_point_events (
  id uuid primary key default gen_random_uuid (),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  lobby_member_id uuid not null references public.lobby_members (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  points integer not null,
  reason public.fantasy_point_reason not null,
  match_id uuid references public.matches (id) on delete set null,
  created_at timestamptz not null default now()
);

create index fantasy_point_events_lobby_member_idx on public.fantasy_point_events (
  lobby_id,
  lobby_member_id
);

-- === trigger: profil ved ny auth user (valgfrit) ===
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user ();

-- === Realtime (Supabase) ===
alter table public.auction_draws replica identity full;
alter table public.bids replica identity full;
alter table public.lobby_members replica identity full;
alter table public.fantasy_point_events replica identity full;
alter table public.roster_entries replica identity full;

alter publication supabase_realtime add table public.auction_draws;
alter publication supabase_realtime add table public.bids;
alter publication supabase_realtime add table public.lobby_members;
alter publication supabase_realtime add table public.fantasy_point_events;
alter publication supabase_realtime add table public.roster_entries;
