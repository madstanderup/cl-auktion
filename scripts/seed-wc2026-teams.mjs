/**
 * Henter VM 2026-hold fra Zafronix API og genererer en SQL-migrationsfil
 * der erstatter indholdet af public.teams med de 48 VM-hold.
 *
 * Kør med: node scripts/seed-wc2026-teams.mjs
 */

import { writeFileSync } from "fs";

const API_KEY = "zwc_free_a414055dfd6fb1c29b4edb19";
const BASE = "https://api.zafronix.com/fifa/worldcup/v1";

async function fetchTeams() {
  const res = await fetch(`${BASE}/teams?tournament=2026`, {
    headers: { "X-API-Key": API_KEY },
  });

  if (!res.ok) {
    throw new Error(`API fejl: ${res.status} ${res.statusText}\n${await res.text()}`);
  }

  const json = await res.json();
  console.log("API svar (første hold):", JSON.stringify(json?.[0] ?? json, null, 2));
  return json;
}

function escape(str) {
  return String(str ?? "").replace(/'/g, "''");
}

async function main() {
  console.log("Henter VM 2026 hold fra Zafronix...");
  const raw = await fetchTeams();

  // Zafronix returnerer enten et array direkte eller { teams: [...] }
  const teams = Array.isArray(raw) ? raw : (raw.teams ?? raw.data ?? []);

  if (!teams.length) {
    console.error("Ingen hold fundet. Fuld svar:", JSON.stringify(raw, null, 2));
    process.exit(1);
  }

  console.log(`Fandt ${teams.length} hold.`);

  // Byg SQL
  const rows = teams.map((t, i) => {
    const name = escape(t.name ?? t.team_name ?? t.country ?? "Ukendt");
    const short = escape(t.short_name ?? t.code ?? t.abbreviation ?? name.slice(0, 3).toUpperCase());
    const logo = t.logo_url ?? t.flag_url ?? t.emblem ?? null;
    const logoSql = logo ? `'${escape(logo)}'` : "null";
    return `  ('${name}', '${short}', ${logoSql}, ${i + 1})`;
  });

  const sql = `-- VM 2026 hold importeret fra Zafronix API (${new Date().toISOString()})
-- Kør dette i Supabase SQL Editor for at erstatte teams med de 48 VM-hold.
-- ADVARSEL: sletter eksisterende hold og nulstiller game_teams!

begin;

-- Frigiv ejerskab i game_teams
update public.game_teams set owner_player_id = null;

-- Ryd game_teams og teams
delete from public.game_teams;
delete from public.teams;

-- Indsæt VM 2026 hold
insert into public.teams (name, short_name, logo_url, sort_seed) values
${rows.join(",\n")};

-- Genopfyld game_teams for alle eksisterende spil
insert into public.game_teams (game_id, team_id)
select g.id, t.id
from public.games g
cross join public.teams t
on conflict (game_id, team_id) do nothing;

commit;
`;

  const outPath = "supabase/run_wc2026_teams.sql";
  writeFileSync(outPath, sql, "utf8");
  console.log(`\nSQL gemt til: ${outPath}`);
  console.log("Kør filen i Supabase SQL Editor for at opdatere holdene.");
}

main().catch((e) => {
  console.error("Fejl:", e.message);
  process.exit(1);
});
