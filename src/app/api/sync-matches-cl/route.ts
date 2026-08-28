import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { CL2627_LEAGUE_FIXTURES } from "@/lib/tournaments/cl2627-fixtures";
import { findCL2627Team } from "@/lib/tournaments/cl2627-teams";
import { clCalcTeamPoints } from "@/lib/tournaments/cl-scoring";
import type { ScoreMatch } from "@/lib/scoring";

const ZAFRONIX_API_KEY = "zwc_free_a414055dfd6fb1c29b4edb19";
// season = startår: 2026 → "UEFA Champions League 2026/27".
// Endpointet svarer 404 indtil sæsonens datasæt publiceres (lodtrækning ultimo
// august 2026) — det håndteres som en stille no-op, så cron-jobbet bare venter.
const ZAFRONIX_URL = "https://api.zafronix.com/uefa/championsleague/v1/matches?season=2026";

/**
 * Zafronix' stageNormalized → vores stage-keys (wc_matches.stage-constraint).
 * Ligafasens præcise navngivning i 26/27-datasættet kendes ikke endnu, så vi
 * matcher tolerant på præfikser; ukendte stages rapporteres i responsen.
 */
function mapStage(normalized: string | undefined): string | null {
  const s = (normalized ?? "").toLowerCase();
  if (s === "round_of_16" || s === "quarter_final" || s === "semi_final" || s === "final") return s;
  if (s.startsWith("league") || s.startsWith("matchday") || s === "group_stage") return "league";
  if (s.includes("playoff")) return "playoff";
  return null;
}

type ApiMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  extraTime: boolean;
  penalties: { home: number; away: number } | null;
  penaltyShootout?: { winner: "home" | "away" } | null;
  stageNormalized: string;
  leg?: number;
  kickoffUtc?: string;
  date?: string;
  kickoff?: string;
  matchDate?: string;
  kickOff?: string;
  startTime?: string;
  datetime?: string;
  scheduledAt?: string;
  utcDate?: string;
  status?: string;
  goals?: { minute: number; team: "home" | "away"; scorer: string }[] | null;
  cards?: { minute: number; team: "home" | "away"; player: string; color: "yellow" | "red"; addedMinute?: number }[] | null;
  lineups?: { home: unknown[]; away: unknown[] } | null;
  substitutions?: { minute: number; team: "home" | "away"; on: string; off: string }[] | null;
  managers?: { home: string; away: string } | null;
  stadium?: string | null;
  venue?: string | null;
  city?: string | null;
};

type DbMatch = {
  id: string;
  game_id: string;
  zafronix_match_id: string | null;
  home_team: string;
  away_team: string;
  stage: string;
  status: string;
};

function extractDate(m: ApiMatch): string | null {
  const raw =
    m.kickoffUtc ?? m.datetime ?? m.scheduledAt ?? m.utcDate ??
    m.matchDate ?? m.kickOff ?? m.startTime ?? m.date ?? null;
  if (!raw) return null;
  try { return new Date(raw).toISOString(); } catch { return null; }
}

function getPenaltyWinner(m: ApiMatch): "home" | "away" | null {
  if (m.penaltyShootout?.winner) return m.penaltyShootout.winner;
  if (m.penalties) {
    if (m.penalties.home > m.penalties.away) return "home";
    if (m.penalties.away > m.penalties.home) return "away";
  }
  return null;
}

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
  // 1. Hent kampe fra Zafronix (DB-klienten oprettes først når der er data)
  let apiRes: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    apiRes = await fetch(ZAFRONIX_URL, {
      headers: { "X-API-Key": ZAFRONIX_API_KEY },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    const msg = String(err).includes("abort") ? "Zafronix svarede ikke inden for 15 sekunder (timeout)" : `Zafronix fetch fejl: ${String(err)}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 26/27-datasættet er ikke publiceret endnu. Kampprogrammet fra lodtrækningen
  // oprettes alligevel nedenfor, så kørslen ikke er spildt.
  const datasetMissing = apiRes.status === 404;

  if (!apiRes.ok && !datasetMissing) {
    const body = await apiRes.text().catch(() => "");
    const isRateLimit = apiRes.status === 429;
    return NextResponse.json({
      error: isRateLimit
        ? `API rate limit nået (429) — du har brugt din daglige kvote. Prøv igen i morgen.`
        : `Zafronix API fejl: HTTP ${apiRes.status}`,
      body: body.slice(0, 300),
    }, { status: 502 });
  }

  let allMatches: ApiMatch[] = [];
  if (!datasetMissing) {
    let apiData: { data?: ApiMatch[]; matches?: ApiMatch[] } | ApiMatch[];
    try {
      apiData = (await apiRes.json()) as { data?: ApiMatch[]; matches?: ApiMatch[] } | ApiMatch[];
    } catch (err) {
      return NextResponse.json({ error: `JSON parse fejl: ${String(err)}` }, { status: 502 });
    }
    if (Array.isArray(apiData)) {
      allMatches = apiData;
    } else if (Array.isArray((apiData as { data?: ApiMatch[] }).data)) {
      allMatches = (apiData as { data: ApiMatch[] }).data;
    } else if (Array.isArray((apiData as { matches?: ApiMatch[] }).matches)) {
      allMatches = (apiData as { matches: ApiMatch[] }).matches;
    }
  }

  const sampleFields = allMatches[0] ? Object.keys(allMatches[0]) : [];
  const unknownStages = new Set<string>();
  const relevant = allMatches.filter((m) => {
    const stage = mapStage(m.stageNormalized);
    if (!stage) unknownStages.add(m.stageNormalized ?? "(mangler)");
    return stage !== null;
  });

  // Ingen resultater at hente — kampprogrammet oprettes stadig nedenfor.
  const apiNote = datasetMissing
    ? "CL 26/27-datasæt ikke publiceret hos Zafronix endnu — kun kampprogrammet er lagt ind."
    : relevant.length === 0
      ? "Ingen kampe fundet i kendte stages."
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
    const rawHome = (m.homeTeam ?? "").trim();
    const rawAway = (m.awayTeam ?? "").trim();
    const homeResolved = rawHome ? findCL2627Team(rawHome) : undefined;
    const awayResolved = rawAway ? findCL2627Team(rawAway) : undefined;
    if (rawHome && !homeResolved) unmatchedNames.add(rawHome);
    if (rawAway && !awayResolved) unmatchedNames.add(rawAway);
    const homeTeam = rawHome ? (homeResolved?.name ?? rawHome) : "TBD";
    const awayTeam = rawAway ? (awayResolved?.name ?? rawAway) : "TBD";
    const stage = mapStage(m.stageNormalized)!;
    const matchDate = extractDate(m);
    // CL-datasættet har ikke altid et status-felt — udled "finished" af at
    // begge scorer er sat, når feltet mangler.
    let apiStatus =
      m.status === "finished" ? "finished"
      : m.status === "live" ? "live"
      : m.status == null && m.homeScore != null && m.awayScore != null ? "finished"
      : "scheduled";
    const hasPenalties = !!(m.penalties ?? m.penaltyShootout);
    const resultType = hasPenalties ? "penalties" : m.extraTime ? "extra_time" : "normal_time";
    const winnerSide = getPenaltyWinner(m);
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
          updates.home_score    = m.homeScore;
          updates.away_score    = m.awayScore;
          updates.result_type   = resultType;
          updates.winner_side   = winnerSide;
          updates.goals         = m.goals ?? null;
          updates.cards         = m.cards ?? null;
          updates.lineups       = m.lineups ?? null;
          updates.substitutions = m.substitutions ?? null;
          pointsRecalculated    = true;
        } else {
          if (m.lineups) updates.lineups = m.lineups;
          if (m.goals)   updates.goals   = m.goals;
          if (m.cards)   updates.cards   = m.cards;
        }
        if (m.stadium ?? m.venue) updates.stadium = m.stadium ?? m.venue;
        if (m.city)     updates.city     = m.city;
        if (m.managers) updates.managers = m.managers;
        toUpdate.push({ id: existing.id, updates });
      } else {
        toInsert.push({
          game_id:           gameId,
          zafronix_match_id: m.id ?? null,
          home_team:         homeTeam,
          away_team:         awayTeam,
          stage,
          match_date:        matchDate,
          home_score:        isFinished ? m.homeScore : null,
          away_score:        isFinished ? m.awayScore : null,
          result_type:       isFinished ? resultType : null,
          winner_side:       isFinished ? winnerSide : null,
          status:            apiStatus,
          goals:             m.goals ?? null,
          cards:             m.cards ?? null,
          lineups:           m.lineups ?? null,
          substitutions:     isFinished ? (m.substitutions ?? null) : null,
          managers:          m.managers ?? null,
          stadium:           m.stadium ?? m.venue ?? null,
          city:              m.city ?? null,
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
    sampleFields,
    unknownStages: [...unknownStages].sort(),
    unmatchedTeamNames: [...unmatchedNames].sort(),
  });
}
