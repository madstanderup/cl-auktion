import { supabase } from "@/lib/supabase";
import { calcTeamPoints, type ScoreMatch } from "@/lib/scoring";
import { WC2026 } from "./wc2026";
import { CL2627 } from "./cl2627";
import { clCalcTeamPoints } from "./cl-scoring";
import type { TournamentConfig, TournamentId } from "./types";

export type { TournamentConfig, TournamentId, TournamentTeam, ScoringRules, StageDef } from "./types";

/** Registrerede turneringer. */
const REGISTRY: Record<string, TournamentConfig> = {
  wc2026: WC2026,
  cl2627: CL2627,
};

/** Turneringer der kan vælges ved spiloprettelse.
 *  CL åbnes når siderne er wiret til turnerings-konfigurationen. */
export const AVAILABLE_TOURNAMENTS: { id: TournamentId; label: string; available: boolean }[] = [
  { id: "wc2026", label: "VM 2026", available: true },
  { id: "cl2627", label: "Champions League 26/27", available: false },
];

/**
 * Pointberegning for et hold i en given turnering.
 * VM bruger den fælles scoring-motor; CL har sin egen (ligatabel,
 * playoff uden point, dobbeltopgør).
 */
export function calcPointsForTournament(config: TournamentConfig, teamName: string, matches: ScoreMatch[]): number {
  if (config.id === "cl2627") return clCalcTeamPoints(teamName, matches);
  return calcTeamPoints(teamName, matches, config.scoring);
}

/** Slår en turnering op; ukendte/gamle spil falder tilbage til VM 2026. */
export function getTournament(id: string | null | undefined): TournamentConfig {
  return REGISTRY[id ?? "wc2026"] ?? WC2026;
}

/**
 * Henter turneringen for et spil via games.tournament_type.
 * Falder tilbage til VM 2026 hvis kolonnen mangler (migration ikke kørt)
 * eller spillet ikke findes.
 */
export async function getTournamentForGame(gameId: string): Promise<TournamentConfig> {
  try {
    const { data, error } = await supabase
      .from("games")
      .select("tournament_type")
      .eq("id", gameId)
      .maybeSingle();
    if (error || !data) return WC2026;
    return getTournament((data as { tournament_type?: string }).tournament_type);
  } catch {
    return WC2026;
  }
}
