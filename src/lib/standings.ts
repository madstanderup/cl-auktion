import { supabase } from "@/lib/supabase";
import { calcTeamPoints, type ScoreMatch } from "@/lib/scoring";
import { getTournament, calcPointsForTournament } from "@/lib/tournaments";

export { calcTeamPoints };
export type MatchRow = ScoreMatch;

export type PublicStanding = { name: string; points: number; teams: number };

/** Henter spillets navn + rangliste (server- og client-sikker). */
export async function fetchPublicStandings(
  gameId: string,
): Promise<{ label: string; standings: PublicStanding[] } | null> {
  let gameRes = await supabase.from("games").select("label, invite_code, tournament_type").eq("id", gameId).maybeSingle();
  if (gameRes.error) {
    // Kolonnen findes ikke endnu (migration ikke kørt) — fald tilbage
    gameRes = (await supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle()) as typeof gameRes;
  }
  const [playersRes, gtRes, teamsRes, matchesRes] = await Promise.all([
    supabase.from("players").select("id, name").eq("game_id", gameId),
    supabase.from("game_teams").select("team_id, owner_player_id").eq("game_id", gameId).not("owner_player_id", "is", null),
    supabase.from("teams").select("id, name"),
    supabase.from("wc_matches").select("home_team,away_team,stage,home_score,away_score,result_type,winner_side,status").eq("game_id", gameId),
  ]);

  const g = gameRes.data as { label?: string | null; invite_code?: string; tournament_type?: string | null } | null;
  if (!g) return null;
  const cfg = getTournament(g.tournament_type);

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
    pointsByPlayer.set(pid, (pointsByPlayer.get(pid) ?? 0) + calcPointsForTournament(cfg, tname, matches));
    teamsByPlayer.set(pid, (teamsByPlayer.get(pid) ?? 0) + 1);
  }

  const standings: PublicStanding[] = [...playerNameById.entries()]
    .map(([pid, name]) => ({ name, points: pointsByPlayer.get(pid) ?? 0, teams: teamsByPlayer.get(pid) ?? 0 }))
    .sort((a, b) => b.points - a.points);

  return { label: g.label ?? g.invite_code ?? "Spil", standings };
}
