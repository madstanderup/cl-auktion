-- Gæste-/sessionspillere fra forsiden (indtil fuld lobby + auth-flow)
create table public.players (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  coins integer not null default 1000 check (coins >= 0),
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now ()
);

create index players_created_at_idx on public.players (created_at desc);

alter table public.players enable row level security;

-- Anonyme spillere kan oprette sig fra landingside; stram policies før produktion.
create policy "players_insert_anon"
on public.players
for insert
to anon
with check (true);

create policy "players_select_anon"
on public.players
for select
to anon
using (true);

create policy "players_insert_authenticated"
on public.players
for insert
to authenticated
with check (true);

create policy "players_select_authenticated"
on public.players
for select
to authenticated
using (true);
