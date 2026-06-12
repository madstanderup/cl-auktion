import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { findWC2026Team } from "@/lib/wc2026-teams";

const ZAFRONIX_API_KEY = "zwc_free_a414055dfd6fb1c29b4edb19";
const ZAFRONIX_URL = "https://api.zafronix.com/fifa/worldcup/v1/matches?year=2026";

const STAGE_MAP: Record<string, string> = {
  group_a: "group", group_b: "group", group_c: "group", group_d: "group",
  group_e: "group", group_f: "group", group_g: "group", group_h: "group",
  group_i: "group", group_j: "group", group_k: "group", group_l: "group",
  round_of_32:   "round_of_32",
  round_of_16:   "round_of_16",
  quarter_final: "quarter_final",
  semi_final:    "semi_final",
  final:         "final",
};

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
};

type DbMatch = {
  id: string;
  game_id: string;
  zafronix_match_id: string | null;
  home_team: string;
  away_team: string;
  status: string;
};

function extractDate(m: ApiMatch): string | null {
  // Foretruk kickoffUtc (fuld dato+tid i UTC), fald tilbage til andre felter
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

export async function GET(req: Request) {
  try { return await runSync(req); }
  catch (err) { return NextResponse.json({ error: `Uventet fejl: ${String(err)}`, stack: err instanceof Error ? err.stack : undefined }, { status: 500 }); }
}
export async function POST(req: Request) {
  try { return await runSync(req); }
  catch (err) { return NextResponse.json({ error: `Uventet fejl: ${String(err)}`, stack: err instanceof Error ? err.stack : undefined }, { status: 500 }); }
}

async function runSync(_req: Request) {
  const supabase = adminClient();

  // 1. Hent kampe fra Zafronix
  let apiRes: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
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

  if (!apiRes.ok) {
    const body = await apiRes.text().catch(() => "");
    const isRateLimit = apiRes.status === 429;
    return NextResponse.json({
      error: isRateLimit
        ? `API rate limit nået (429) — du har brugt din daglige kvote på 250 kald. Prøv igen i morgen.`
        : `Zafronix API fejl: HTTP ${apiRes.status}`,
      body: body.slice(0, 300),
    }, { status: 502 });
  }

  let apiData: { data?: ApiMatch[]; matches?: ApiMatch[] } | ApiMatch[];
  try {
    apiData = (await apiRes.json()) as { data?: ApiMatch[]; matches?: ApiMatch[] } | ApiMatch[];
  } catch (err) {
    return NextResponse.json({ error: `JSON parse fejl: ${String(err)}` }, { status: 502 });
  }

  let allMatches: ApiMatch[] = [];
  if (Array.isArray(apiData)) {
    allMatches = apiData;
  } else if (Array.isArray((apiData as { data?: ApiMatch[] }).data)) {
    allMatches = (apiData as { data: ApiMatch[] }).data;
  } else if (Array.isArray((apiData as { matches?: ApiMatch[] }).matches)) {
    allMatches = (apiData as { matches: ApiMatch[] }).matches;
  }

  const sampleFields = allMatches[0] ? Object.keys(allMatches[0]) : [];
  const relevant = allMatches.filter((m) => STAGE_MAP[m.stageNormalized]);

  if (relevant.length === 0) {
    return NextResponse.json({
      ok: true, synced: 0,
      message: "Ingen kampe fundet i kendte stages.",
      totalFromApi: allMatches.length, sampleFields,
      sample: allMatches[0] ?? null,
    });
  }

  // 2. Hent alle spil og alle eksisterende wc_matches i ét kald
  const [{ data: games, error: gamesErr }, { data: existingRows }] = await Promise.all([
    supabase.from("games").select("id"),
    supabase.from("wc_matches").select("id, game_id, zafronix_match_id, home_team, away_team, status"),
  ]);

  if (gamesErr) return NextResponse.json({ error: gamesErr.message }, { status: 500 });
  if (!games?.length) return NextResponse.json({ ok: true, synced: 0, message: "Ingen spil i DB." });

  const gameIds = games.map((g) => String(g.id));

  // Byg lookup-map: "gameId|zafronix_id" → DbMatch  og  "gameId|HOME|AWAY" → DbMatch
  const byZafId = new Map<string, DbMatch>();
  const byTeams = new Map<string, DbMatch>();
  for (const row of (existingRows ?? []) as DbMatch[]) {
    const gid = String(row.game_id);
    if (row.zafronix_match_id) {
      byZafId.set(`${gid}|${row.zafronix_match_id}`, row);
    }
    byTeams.set(`${gid}|${row.home_team.toLowerCase()}|${row.away_team.toLowerCase()}`, row);
  }

  // 3. Byg lister over upserts
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; updates: Record<string, unknown> }[] = [];
  let pointsRecalculated = false;
  const unmatchedNames = new Set<string>();

  for (const m of relevant) {
    const rawHome   = (m.homeTeam ?? "").trim();
    const rawAway   = (m.awayTeam ?? "").trim();
    const homeResolved = rawHome ? findWC2026Team(rawHome) : undefined;
    const awayResolved = rawAway ? findWC2026Team(rawAway) : undefined;
    if (rawHome && !homeResolved) unmatchedNames.add(rawHome);
    if (rawAway && !awayResolved) unmatchedNames.add(rawAway);
    const homeTeam  = rawHome ? (homeResolved?.name ?? rawHome) : "TBD";
    const awayTeam  = rawAway ? (awayResolved?.name ?? rawAway) : "TBD";
    const stage     = STAGE_MAP[m.stageNormalized];
    const matchDate = extractDate(m);
    // Brug API's status-felt: "finished" | "live" | alt → "scheduled"
    const apiStatus = m.status === "finished" ? "finished" : m.status === "live" ? "live" : "scheduled";
    const isFinished = apiStatus === "finished";
    const hasPenalties = !!(m.penalties ?? m.penaltyShootout);
    const resultType = hasPenalties ? "penalties" : m.extraTime ? "extra_time" : "normal_time";
    const winnerSide = getPenaltyWinner(m);

    for (const gameId of gameIds) {
      // Slå op: foretruk zafronix_id, så kanoniske navne, så rå API-navne
      const existing =
        (m.id ? byZafId.get(`${gameId}|${m.id}`) : undefined) ??
        byTeams.get(`${gameId}|${homeTeam.toLowerCase()}|${awayTeam.toLowerCase()}`) ??
        byTeams.get(`${gameId}|${rawHome}|${rawAway}`);

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
          updates.home_score     = m.homeScore;
          updates.away_score     = m.awayScore;
          updates.result_type    = resultType;
          updates.winner_side    = winnerSide;
          updates.goals          = m.goals ?? null;
          updates.cards          = m.cards ?? null;
          updates.lineups        = m.lineups ?? null;
          updates.substitutions  = m.substitutions ?? null;
          pointsRecalculated     = true;
        } else {
          // Gem lineups selv for ikke-færdige kampe (fx live)
          if (m.lineups) updates.lineups = m.lineups;
          if (m.goals)   updates.goals   = m.goals;
          if (m.cards)   updates.cards   = m.cards;
        }
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
        });
        if (isFinished) pointsRecalculated = true;
      }
    }
  }

  // 4. Udfør DB-operationer — alt parallelt for at undgå timeout
  let synced = 0;

  // Alle inserts i ét kald
  if (toInsert.length > 0) {
    const { error } = await supabase.from("wc_matches").insert(toInsert);
    if (!error) synced += toInsert.length;
  }

  // Alle updates parallelt på én gang
  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map(({ id, updates }) =>
        supabase.from("wc_matches").update(updates).eq("id", id)
      )
    );
    synced += toUpdate.length;
  }

  // Genberegn point
  if (pointsRecalculated) {
    await Promise.all(
      games.map((g) => supabase.rpc("recalculate_game_points", { p_game_id: g.id }))
    );
  }

  return NextResponse.json({
    ok: true,
    synced,
    inserted: toInsert.length,
    updated: toUpdate.length,
    totalFromApi: allMatches.length,
    relevantFromApi: relevant.length,
    pointsRecalculated,
    sampleFields,
    unmatchedTeamNames: [...unmatchedNames].sort(),
  });
}
