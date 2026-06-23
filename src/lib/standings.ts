import { supabase } from "@/lib/supabase";
import { findWC2026Team } from "@/lib/wc2026-teams";

const STAGES = ["group", "round_of_32", "round_of_16", "quarter_final", "semi_final", "final"];
const STAGE_BONUS: Record<string, number> = {
  round_of_32: 100, round_of_16: 200, quarter_final: 400, semi_final: 600, final: 800,
};

export type MatchRow = {
  home_team: string; away_team: string; stage: string;
  home_score: number | null; away_score: number | null;
  result_type: string | null; winner_side: string | null; status: string;
};

export function calcTeamPoints(teamName: string, matches: MatchRow[]): number {
  const normalName = findWC2026Team(teamName)?.name ?? teamName;
  let total = 0;
  for (const stage of STAGES) {
    const ms = matches.filter((m) => m.stage === stage && m.status === "finished" && (m.home_team === normalName || m.away_team === normalName));
    for (const m of ms) {
      const isHome = m.home_team === normalName;
      const myScore = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
      const opScore = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0);
      let won = myScore > opScore;
      let lost = myScore < opScore;
      if (m.result_type === "penalties" && m.winner_side) {
        won = (isHome && m.winner_side === "home") || (!isHome && m.winner_side === "away");
        lost = !won;
      }
      const isET = m.result_type === "extra_time" || m.result_type === "penalties";
      if (stage === "group") {
        total += myScore === opScore ? 50 : won ? 150 : 0;
      } else {
        if (isET) { total += 50; if (won) total += 50; } else if (won) total += 150;
        if (lost) total += STAGE_BONUS[stage] ?? 0; // avancement-bonus kun til taberen
        if (stage === "final" && won) total += 1000;
      }
    }
  }
  return total;
}

export type PublicStanding = { name: string; points: number; teams: number };

/** Henter spillets navn + rangliste (server- og client-sikker). */
export async function fetchPublicStandings(
  gameId: string,
): Promise<{ label: string; standings: PublicStanding[] } | null> {
  const [gameRes, playersRes, gtRes, teamsRes, matchesRes] = await Promise.all([
    supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
    supabase.from("players").select("id, name").eq("game_id", gameId),
    supabase.from("game_teams").select("team_id, owner_player_id").eq("game_id", gameId).not("owner_player_id", "is", null),
    supabase.from("teams").select("id, name"),
    supabase.from("wc_matches").select("home_team,away_team,stage,home_score,away_score,result_type,winner_side,status").eq("game_id", gameId),
  ]);

  const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
  if (!g) return null;

  const playerNameById = new Map(((playersRes.data ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), String(p.name)]));
  const teamNameById = new Map(((teamsRes.data ?? []) as Record<string, unknown>[]).map((t) => [String(t.id), String(t.name)]));

  const matches: MatchRow[] = ((matchesRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
    home_team: String(m.home_team), away_team: String(m.away_team), stage: String(m.stage),
    home_score: m.home_score != null ? Number(m.home_score) : null,
    away_score: m.away_score != null ? Number(m.away_score) : null,
    result_type: m.result_type ? String(m.result_type) : null,
    winner_side: m.winner_side ? String(m.winner_side) : null,
    status: String(m.status),
  }));

  const pointsByPlayer = new Map<string, number>();
  const teamsByPlayer = new Map<string, number>();
  for (const gt of (gtRes.data ?? []) as Record<string, unknown>[]) {
    const pid = String(gt.owner_player_id);
    const tname = teamNameById.get(String(gt.team_id));
    if (!tname) continue;
    pointsByPlayer.set(pid, (pointsByPlayer.get(pid) ?? 0) + calcTeamPoints(tname, matches));
    teamsByPlayer.set(pid, (teamsByPlayer.get(pid) ?? 0) + 1);
  }

  const standings: PublicStanding[] = [...playerNameById.entries()]
    .map(([pid, name]) => ({ name, points: pointsByPlayer.get(pid) ?? 0, teams: teamsByPlayer.get(pid) ?? 0 }))
    .sort((a, b) => b.points - a.points);

  return { label: g.label ?? g.invite_code ?? "Spil", standings };
}
