import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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
  penaltyShootout: { winner: "home" | "away" } | null;
  stageNormalized: string;
  // Mulige dato-felter fra Zafronix — vi prøver alle
  date?: string;
  matchDate?: string;
  kickOff?: string;
  kickoff?: string;
  startTime?: string;
  datetime?: string;
  scheduledAt?: string;
  utcDate?: string;
  status?: string;
};

function extractDate(m: ApiMatch): string | null {
  const raw =
    m.date ?? m.matchDate ?? m.kickOff ?? m.kickoff ??
    m.startTime ?? m.datetime ?? m.scheduledAt ?? m.utcDate ?? null;
  if (!raw) return null;
  try {
    return new Date(raw).toISOString();
  } catch {
    return null;
  }
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: Request) { return runSync(req); }
export async function POST(req: Request) { return runSync(req); }

async function runSync(_req: Request) {
  const supabase = adminClient();

  // 1. Hent ALLE kampe fra Zafronix (inkl. planlagte)
  const apiRes = await fetch(ZAFRONIX_URL, {
    headers: { "X-API-Key": ZAFRONIX_API_KEY },
    next: { revalidate: 0 },
  });
  if (!apiRes.ok) {
    return NextResponse.json({ error: `Zafronix API fejl: ${apiRes.status}` }, { status: 502 });
  }

  const apiData = (await apiRes.json()) as { data?: ApiMatch[]; matches?: ApiMatch[] } | ApiMatch[];

  // Håndter forskellige API-svar-strukturer
  let allMatches: ApiMatch[] = [];
  if (Array.isArray(apiData)) {
    allMatches = apiData;
  } else if (Array.isArray((apiData as { data?: ApiMatch[] }).data)) {
    allMatches = (apiData as { data: ApiMatch[] }).data;
  } else if (Array.isArray((apiData as { matches?: ApiMatch[] }).matches)) {
    allMatches = (apiData as { matches: ApiMatch[] }).matches;
  }

  // Log første kamp for at se hvilke felter API'en returnerer
  const sampleFields = allMatches[0] ? Object.keys(allMatches[0]) : [];

  // Filtrer til kendte stages
  const relevant = allMatches.filter((m) => STAGE_MAP[m.stageNormalized]);

  if (relevant.length === 0) {
    return NextResponse.json({
      ok: true,
      synced: 0,
      message: "Ingen kampe fundet i kendte stages.",
      totalFromApi: allMatches.length,
      sampleFields,
      sample: allMatches[0] ?? null,
    });
  }

  const { data: games, error: gamesErr } = await supabase.from("games").select("id");
  if (gamesErr) return NextResponse.json({ error: gamesErr.message }, { status: 500 });
  if (!games?.length) return NextResponse.json({ ok: true, synced: 0, message: "Ingen spil i DB." });

  let synced = 0;
  let pointsRecalculated = false;

  for (const m of relevant) {
    const homeTeam  = m.homeTeam.trim();
    const awayTeam  = m.awayTeam.trim();
    const stage     = STAGE_MAP[m.stageNormalized];
    const matchDate = extractDate(m);
    const isFinished = m.homeScore !== null && m.awayScore !== null;
    const resultType = m.penaltyShootout ? "penalties" : m.extraTime ? "extra_time" : "normal_time";
    const winnerSide = m.penaltyShootout?.winner ?? null;

    for (const game of games) {
      const gameId = String(game.id);

      // Slå op via zafronix_match_id (hurtigst) eller hold-navne
      const { data: existing } = await supabase
        .from("wc_matches")
        .select("id, status")
        .eq("game_id", gameId)
        .or(
          m.id
            ? `zafronix_match_id.eq.${m.id},and(home_team.ilike.${homeTeam},away_team.ilike.${awayTeam})`
            : `home_team.ilike.${homeTeam},away_team.ilike.${awayTeam}`,
        )
        .maybeSingle();

      if (existing) {
        // Allerede finished — opdater kun hvis ny info
        if (existing.status === "finished" && !isFinished) continue;

        const updates: Record<string, unknown> = {};
        if (matchDate) updates.match_date = matchDate;
        if (isFinished) {
          updates.home_score   = m.homeScore;
          updates.away_score   = m.awayScore;
          updates.result_type  = resultType;
          updates.winner_side  = winnerSide;
          updates.status       = "finished";
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from("wc_matches").update(updates).eq("id", existing.id);
          synced++;
          if (isFinished) pointsRecalculated = true;
        }
      } else {
        // Indsæt ny kamp (planlagt eller færdig)
        await supabase.from("wc_matches").insert({
          game_id:            gameId,
          zafronix_match_id:  m.id ?? null,
          home_team:          homeTeam,
          away_team:          awayTeam,
          stage,
          match_date:         matchDate,
          home_score:         isFinished ? m.homeScore : null,
          away_score:         isFinished ? m.awayScore : null,
          result_type:        isFinished ? resultType : null,
          winner_side:        isFinished ? winnerSide : null,
          status:             isFinished ? "finished" : "scheduled",
        });
        synced++;
        if (isFinished) pointsRecalculated = true;
      }
    }
  }

  // Genberegn point hvis der var nye resultater
  if (pointsRecalculated) {
    for (const g of games) {
      await supabase.rpc("recalculate_game_points", { p_game_id: g.id });
    }
  }

  return NextResponse.json({
    ok: true,
    synced,
    totalFromApi: allMatches.length,
    relevantFromApi: relevant.length,
    pointsRecalculated,
    sampleFields,
  });
}
