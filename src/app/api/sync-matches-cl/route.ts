import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { CL2627_LEAGUE_FIXTURES } from "@/lib/tournaments/cl2627-fixtures";
import { parseUefaMatch, type ParsedMatch, type UefaMatch } from "@/lib/tournaments/cl-uefa";
import { findCL2627Team } from "@/lib/tournaments/cl2627-teams";
import { clCalcTeamPoints } from "@/lib/tournaments/cl-scoring";
import type { ScoreMatch } from "@/lib/scoring";

// UEFA's eget kamp-API — samme kilde som uefa.com selv bruger. Ingen API-nøgle,
// kun den header uefa.com sender. seasonYear er året finalen spilles, så 2027
// = sæson 26/27. Zafronix, som VM-syncen bruger, fik aldrig CL's ligafase:
// deres 25/26-datasæt indeholder kun knockout-kampene.
const UEFA_URL = "https://match.uefa.com/v5/matches?competitionId=1&seasonYear=2027&limit=500&offset=0";
const UEFA_HEADERS = { "x-requested-with": "uefa.com" };

type DbMatch = {
  id: string;
  game_id: string;
  /** Kolonnen hedder stadig zafronix_*, men rummer UEFA's kamp-id for CL. */
  zafronix_match_id: string | null;
  home_team: string;
  away_team: string;
  stage: string;
  status: string;
};

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Genberegn players.points for ét CL-spil med TS-motoren (clCalcTeamPoints).
 * Databasens recalculate_game_points er VM-specifik og kan IKKE bruges til CL
 * (progressiv model, top-8-bonus, dobbeltopgør, playoff uden kamppoint).
 */
async function recalcClGamePoints(supabase: SupabaseClient, gameId: string): Promise<void> {
  const [matchesRes, playersRes, gtRes] = await Promise.all([
    supabase
      .from("wc_matches")
      .select("home_team,away_team,stage,home_score,away_score,result_type,winner_side,status")
      .eq("game_id", gameId)
      .order("match_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("players").select("id,points").eq("game_id", gameId),
    supabase.from("game_teams").select("team_id,owner_player_id").eq("game_id", gameId).not("owner_player_id", "is", null),
  ]);

  const matches: ScoreMatch[] = ((matchesRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
    home_team: String(m.home_team), away_team: String(m.away_team), stage: String(m.stage),
    home_score: m.home_score != null ? Number(m.home_score) : null,
    away_score: m.away_score != null ? Number(m.away_score) : null,
    result_type: m.result_type ? String(m.result_type) : null,
    winner_side: m.winner_side ? String(m.winner_side) : null,
    status: String(m.status),
  }));

  const gtRows = (gtRes.data ?? []) as { team_id: string; owner_player_id: string }[];
  const teamIds = [...new Set(gtRows.map((r) => String(r.team_id)))];
  const { data: teamRows } = teamIds.length
    ? await supabase.from("teams").select("id,name").in("id", teamIds)
    : { data: [] as { id: string; name: string }[] };
  const teamNameById = new Map((teamRows ?? []).map((t) => [String(t.id), String(t.name)]));

  const teamsByOwner = new Map<string, string[]>();
  for (const r of gtRows) {
    const name = teamNameById.get(String(r.team_id));
    if (!name) continue;
    const arr = teamsByOwner.get(String(r.owner_player_id)) ?? [];
    arr.push(name);
    teamsByOwner.set(String(r.owner_player_id), arr);
  }

  const updates: PromiseLike<unknown>[] = [];
  for (const p of (playersRes.data ?? []) as { id: string; points: number }[]) {
    const total = (teamsByOwner.get(String(p.id)) ?? [])
      .reduce((sum, teamName) => sum + clCalcTeamPoints(teamName, matches), 0);
    if (total !== Number(p.points)) {
      updates.push(supabase.from("players").update({ points: total }).eq("id", p.id));
    }
  }
  await Promise.all(updates);
}

/**
 * Opret ligafasens 144 kampe (lodtrækningen i Monaco 27. august 2026) som
 * "scheduled" for hvert CL-spil der mangler dem — så simulering, kampliste og
 * stilling har det rigtige program allerede inden resultaterne begynder at
 * komme ind. Idempotent: en kamp springes over hvis den allerede findes, også
 * med omvendt hjemme/ude, så syncen ikke kan nå at oprette en dublet.
 * Datoerne kommer fra syncen når de publiceres.
 */
async function seedLeagueFixtures(
  supabase: SupabaseClient,
  gameIds: string[],
  byTeams: Map<string, DbMatch>,
): Promise<{ inserted: number; error: string | null }> {
  const rows: Record<string, unknown>[] = [];
  for (const gameId of gameIds) {
    for (const [home, away] of CL2627_LEAGUE_FIXTURES) {
      const h = home.toLowerCase(), a = away.toLowerCase();
      if (byTeams.has(`${gameId}|league|${h}|${a}`) || byTeams.has(`${gameId}|league|${a}|${h}`)) continue;
      rows.push({ game_id: gameId, home_team: home, away_team: away, stage: "league", status: "scheduled" });
    }
  }
  if (rows.length === 0) return { inserted: 0, error: null };

  const { data, error } = await supabase
    .from("wc_matches")
    .insert(rows)
    .select("id, game_id, zafronix_match_id, home_team, away_team, stage, status");
  if (error) return { inserted: 0, error: error.message };

  // Læg de nye rækker i opslaget, så resultat-syncen opdaterer dem i samme kørsel
  for (const row of (data ?? []) as DbMatch[]) {
    byTeams.set(`${String(row.game_id)}|${row.stage}|${row.home_team.toLowerCase()}|${row.away_team.toLowerCase()}`, row);
  }
  return { inserted: (data ?? []).length, error: null };
}

export async function GET(req: Request) {
  try { return await runSync(req); }
  catch (err) { return NextResponse.json({ error: `Uventet fejl: ${String(err)}`, stack: err instanceof Error ? err.stack : undefined }, { status: 500 }); }
}
export async function POST(req: Request) {
  try { return await runSync(req); }
  catch (err) { return NextResponse.json({ error: `Uventet fejl: ${String(err)}`, stack: err instanceof Error ? err.stack : undefined }, { status: 500 }); }
}

async function runSync(_req: Request) {
  // 1. Hent kampe fra UEFA (DB-klienten oprettes først når der er data)
  let apiRes: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    apiRes = await fetch(UEFA_URL, {
      headers: UEFA_HEADERS,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    const msg = String(err).includes("abort") ? "UEFA svarede ikke inden for 15 sekunder (timeout)" : `UEFA fetch fejl: ${String(err)}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!apiRes.ok) {
    const body = await apiRes.text().catch(() => "");
    return NextResponse.json({
      error: `UEFA API fejl: HTTP ${apiRes.status}`,
      body: body.slice(0, 300),
    }, { status: 502 });
  }

  let allMatches: UefaMatch[] = [];
  try {
    const apiData = (await apiRes.json()) as UefaMatch[];
    if (Array.isArray(apiData)) allMatches = apiData;
  } catch (err) {
    return NextResponse.json({ error: `JSON parse fejl: ${String(err)}` }, { status: 502 });
  }

  // Kun turneringsfasen — kvalifikationen har sin egen "Play-Offs"-runde, som
  // ikke må forveksles med knockout-playoff'en mellem nr. 9-24.
  const tournament = allMatches.filter((m) => m.competitionPhase === "TOURNAMENT");
  const unknownStages = new Set<string>();
  const relevant: ParsedMatch[] = [];
  for (const m of tournament) {
    const parsed = parseUefaMatch(m);
    if (parsed) relevant.push(parsed);
    else unknownStages.add(m.round?.metaData?.name ?? "(mangler)");
  }

  // Ingen kampe at hente — kampprogrammet oprettes stadig nedenfor.
  const apiNote = relevant.length === 0
    ? "Ingen kampe i turneringsfasen hos UEFA endnu — kun kampprogrammet er lagt ind."
    : null;

  // 2. Hent CL-spil og deres eksisterende kampe
  const supabase = adminClient();
  const gamesRes = await supabase.from("games").select("id").eq("tournament_type", "cl2627");
  if (gamesRes.error) return NextResponse.json({ error: gamesRes.error.message }, { status: 500 });
  const games = gamesRes.data as { id: string }[];
  if (!games?.length) return NextResponse.json({ ok: true, synced: 0, message: "Ingen CL-spil i DB." });

  const gameIds = games.map((g) => String(g.id));
  const { data: existingRows } = await supabase
    .from("wc_matches")
    .select("id, game_id, zafronix_match_id, home_team, away_team, stage, status")
    .in("game_id", gameIds);

  // Lookup: "gameId|zafronix_id" → række  og  "gameId|stage|HOME|AWAY" → række.
  // Stage indgår i nøglen fordi to hold kan mødes i både liga og knockout
  // med samme hjemme/ude-orientering.
  const byZafId = new Map<string, DbMatch>();
  const byTeams = new Map<string, DbMatch>();
  for (const row of (existingRows ?? []) as DbMatch[]) {
    const gid = String(row.game_id);
    if (row.zafronix_match_id) {
      byZafId.set(`${gid}|${row.zafronix_match_id}`, row);
    }
    byTeams.set(`${gid}|${row.stage}|${row.home_team.toLowerCase()}|${row.away_team.toLowerCase()}`, row);
  }

  // 2b. Opret ligafasens kampprogram i de spil der mangler det
  const seed = await seedLeagueFixtures(supabase, gameIds, byTeams);

  // 3. Byg upsert-lister
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; updates: Record<string, unknown> }[] = [];
  let pointsRecalculated = false;
  const unmatchedNames = new Set<string>();

  for (const m of relevant) {
    const rawHome = m.rawHome;
    const rawAway = m.rawAway;
    const homeResolved = rawHome ? findCL2627Team(rawHome) : undefined;
    const awayResolved = rawAway ? findCL2627Team(rawAway) : undefined;
    if (rawHome && !homeResolved) unmatchedNames.add(rawHome);
    if (rawAway && !awayResolved) unmatchedNames.add(rawAway);
    const homeTeam = rawHome ? (homeResolved?.name ?? rawHome) : "TBD";
    const awayTeam = rawAway ? (awayResolved?.name ?? rawAway) : "TBD";
    const stage = m.stage;
    const matchDate = m.matchDate;
    let apiStatus = m.status;
    const resultType = m.resultType;
    const winnerSide = m.winnerSide;
    // Stol ikke på umulige resultater: "færdig" uden scorer, eller en "færdig"
    // FINALE der står lige uden straffe-vinder (dobbeltopgørs-ben kan lovligt
    // ende uafgjort). Behandl som live, så der ikke gives forkerte point —
    // admin kan rette manuelt uden at senere syncs overskriver.
    if (apiStatus === "finished") {
      const missingScores = m.homeScore == null || m.awayScore == null;
      const finalDrawWithoutWinner =
        stage === "final" && m.homeScore != null && m.homeScore === m.awayScore && !winnerSide;
      if (missingScores || finalDrawWithoutWinner) apiStatus = "live";
    }
    const isFinished = apiStatus === "finished";

    for (const gameId of gameIds) {
      const existing =
        (m.id ? byZafId.get(`${gameId}|${m.id}`) : undefined) ??
        byTeams.get(`${gameId}|${stage}|${homeTeam.toLowerCase()}|${awayTeam.toLowerCase()}`) ??
        byTeams.get(`${gameId}|${stage}|${rawHome.toLowerCase()}|${rawAway.toLowerCase()}`);

      if (existing) {
        if (existing.status === "finished" && !isFinished) continue;

        const updates: Record<string, unknown> = {
          home_team: homeTeam,
          away_team: awayTeam,
          zafronix_match_id: m.id ?? existing.zafronix_match_id,
          status: apiStatus,
        };
        if (matchDate) updates.match_date = matchDate;
        if (isFinished) {
          updates.home_score  = m.homeScore;
          updates.away_score  = m.awayScore;
          updates.result_type = resultType;
          updates.winner_side = winnerSide;
          updates.goals       = m.goals;
          pointsRecalculated  = true;
        } else if (m.goals) {
          updates.goals = m.goals;
        }
        if (m.stadium) updates.stadium = m.stadium;
        if (m.city)    updates.city    = m.city;
        toUpdate.push({ id: existing.id, updates });
      } else {
        toInsert.push({
          game_id:           gameId,
          zafronix_match_id: m.id,
          home_team:         homeTeam,
          away_team:         awayTeam,
          stage,
          match_date:        matchDate,
          home_score:        isFinished ? m.homeScore : null,
          away_score:        isFinished ? m.awayScore : null,
          result_type:       isFinished ? resultType : null,
          winner_side:       isFinished ? winnerSide : null,
          status:            apiStatus,
          goals:             m.goals,
          stadium:           m.stadium,
          city:              m.city,
        });
        if (isFinished) pointsRecalculated = true;
      }
    }
  }

  // 4. Udfør DB-operationer
  let synced = 0;

  if (toInsert.length > 0) {
    const { error } = await supabase.from("wc_matches").insert(toInsert);
    if (!error) synced += toInsert.length;
  }

  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map(({ id, updates }) =>
        supabase.from("wc_matches").update(updates).eq("id", id)
      )
    );
    synced += toUpdate.length;
  }

  // Genberegn point med CL-motoren (TS) — ikke den VM-specifikke DB-RPC
  if (pointsRecalculated) {
    await Promise.all(games.map((g) => recalcClGamePoints(supabase, String(g.id))));
  }

  return NextResponse.json({
    ok: true,
    synced,
    message: apiNote ?? undefined,
    seededFixtures: seed.inserted,
    seedError: seed.error ?? undefined,
    inserted: toInsert.length,
    updated: toUpdate.length,
    totalFromApi: allMatches.length,
    relevantFromApi: relevant.length,
    pointsRecalculated,
    unknownStages: [...unknownStages].sort(),
    unmatchedTeamNames: [...unmatchedNames].sort(),
  });
}
