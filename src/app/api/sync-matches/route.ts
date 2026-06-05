import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ZAFRONIX_API_KEY = "zwc_free_a414055dfd6fb1c29b4edb19";
const ZAFRONIX_URL = "https://api.zafronix.com/fifa/worldcup/v1/matches?year=2026";

// Map Zafronix stageNormalized → our DB stage
const STAGE_MAP: Record<string, string> = {
  group_a: "group", group_b: "group", group_c: "group", group_d: "group",
  group_e: "group", group_f: "group", group_g: "group", group_h: "group",
  group_i: "group", group_j: "group", group_k: "group", group_l: "group",
  round_of_32:  "round_of_32",
  round_of_16:  "round_of_16",
  quarter_final: "quarter_final",
  semi_final:    "semi_final",
  final:         "final",
  // third_place omitted — not part of our scoring
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
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Allow both GET (cron) and POST (manual trigger)
export async function GET(req: Request) {
  return runSync(req);
}
export async function POST(req: Request) {
  return runSync(req);
}

async function runSync(_req: Request) {
  // Basic secret check for cron security
  // Vercel cron calls include a CRON_SECRET header automatically
  // Manual POST from superadmin skips the check

  const supabase = adminClient();

  // 1. Fetch matches from Zafronix
  const apiRes = await fetch(ZAFRONIX_URL, {
    headers: { "X-API-Key": ZAFRONIX_API_KEY },
    next: { revalidate: 0 },
  });
  if (!apiRes.ok) {
    return NextResponse.json({ error: `Zafronix API fejl: ${apiRes.status}` }, { status: 502 });
  }
  const apiData = (await apiRes.json()) as { data: ApiMatch[] };

  // 2. Filter to finished matches in stages we care about
  const finished = apiData.data.filter(
    (m) => m.homeScore !== null && m.awayScore !== null && STAGE_MAP[m.stageNormalized],
  );

  if (finished.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: "Ingen afsluttede kampe endnu." });
  }

  // 3. Get all games
  const { data: games, error: gamesErr } = await supabase.from("games").select("id");
  if (gamesErr) return NextResponse.json({ error: gamesErr.message }, { status: 500 });
  if (!games || games.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: "Ingen spil i DB." });
  }

  let synced = 0;

  for (const m of finished) {
    const homeTeam = m.homeTeam.trim();
    const awayTeam = m.awayTeam.trim();
    const stage = STAGE_MAP[m.stageNormalized];
    const homeScore = m.homeScore!;
    const awayScore = m.awayScore!;
    const resultType = m.penaltyShootout ? "penalties" : m.extraTime ? "extra_time" : "normal";
    const winnerSide = m.penaltyShootout?.winner ?? null;

    for (const game of games) {
      const gameId = String(game.id);

      // Check if match exists for this game
      const { data: existing } = await supabase
        .from("wc_matches")
        .select("id, status")
        .eq("game_id", gameId)
        .ilike("home_team", homeTeam)
        .ilike("away_team", awayTeam)
        .maybeSingle();

      if (existing) {
        // Already finished — skip
        if (existing.status === "finished") continue;

        // Update
        await supabase
          .from("wc_matches")
          .update({
            home_score: homeScore,
            away_score: awayScore,
            result_type: resultType,
            winner_side: winnerSide,
            status: "finished",
          })
          .eq("id", existing.id);
      } else {
        // Insert new match row for this game
        await supabase.from("wc_matches").insert({
          game_id: gameId,
          home_team: homeTeam,
          away_team: awayTeam,
          stage,
          home_score: homeScore,
          away_score: awayScore,
          result_type: resultType,
          winner_side: winnerSide,
          status: "finished",
        });
      }

      synced++;
    }
  }

  // 4. Recalculate points for all games
  if (synced > 0) {
    const { data: allGames } = await supabase.from("games").select("id");
    for (const g of allGames ?? []) {
      await supabase.rpc("recalculate_game_points", { p_game_id: g.id });
    }
  }

  return NextResponse.json({ ok: true, synced, finishedFromApi: finished.length });
}
