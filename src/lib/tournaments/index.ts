import { supabase } from "@/lib/supabase";
import { calcTeamPoints, teamMatchPoints, groupQualBonus, type ScoreMatch } from "@/lib/scoring";
import { computeEliminatedTeams } from "@/lib/tournament";
import { WC2026 } from "./wc2026";
import { CL2627 } from "./cl2627";
import { clCalcTeamPoints, clTeamMatchPoints, clComputeEliminated, clLeagueTop8, CL_TOP8_BONUS } from "./cl-scoring";
import type { TournamentConfig, TournamentId } from "./types";

export type { TournamentConfig, TournamentId, TournamentTeam, ScoringRules, StageDef } from "./types";

/** Registrerede turneringer. */
const REGISTRY: Record<string, TournamentConfig> = {
  wc2026: WC2026,
  cl2627: CL2627,
};

/** Turneringer der kan vælges ved spiloprettelse. */
export const AVAILABLE_TOURNAMENTS: { id: TournamentId; label: string; available: boolean }[] = [
  { id: "wc2026", label: "VM 2026", available: true },
  { id: "cl2627", label: "Champions League 26/27 (beta — dummy-hold)", available: true },
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

/** Point for ét hold i én kamp (til pr.-kamp-visning). */
export function matchPointsForTournament(config: TournamentConfig, m: ScoreMatch, isHome: boolean, allMatches: ScoreMatch[]): number {
  if (config.id === "cl2627") return clTeamMatchPoints(m, isHome, allMatches);
  return teamMatchPoints(m, isHome, config.scoring);
}

/** Udryddede hold (kanoniske navne, lowercase). */
export function eliminatedForTournament(config: TournamentConfig, matches: ScoreMatch[]): Set<string> {
  if (config.id === "cl2627") return clComputeEliminated(matches);
  return computeEliminatedTeams(matches);
}

/** Antal hold i live blandt en liste af (rå) holdnavne. */
export function countAliveForTournament(config: TournamentConfig, teamNames: string[], eliminated: Set<string>): number {
  return teamNames.reduce((n, t) => {
    const canon = (config.findTeam(t)?.name ?? t).toLowerCase();
    return n + (eliminated.has(canon) ? 0 : 1);
  }, 0);
}

/** Kvalifikations-bonus for at gå videre fra gruppe-/ligafasen. */
export function leagueQualBonusForTournament(config: TournamentConfig, teamName: string, matches: ScoreMatch[]): number {
  if (config.id === "cl2627") {
    const canon = (config.findTeam(teamName)?.name ?? teamName).toLowerCase();
    return clLeagueTop8(matches).has(canon) ? CL_TOP8_BONUS : 0;
  }
  return groupQualBonus(teamName, matches, config.scoring);
}

/** stage-key → label for turneringen. */
export function stageLabels(config: TournamentConfig): Record<string, string> {
  return Object.fromEntries(config.stages.map((s) => [s.key, s.label]));
}

/** Slår en turnering op; ukendte/gamle spil falder tilbage til VM 2026. */
export function getTournament(id: string | null | undefined): TournamentConfig {
  return REGISTRY[id ?? "wc2026"] ?? WC2026;
}

/**
 * Cache af turnering pr. spil. Turneringstypen for et spil ændrer sig aldrig,
 * så vi henter den kun én gang. `inflight` sikrer at samtidige kald (side, nav,
 * sidebet-inbox m.fl. på samme render) deler ét enkelt databasekald i stedet
 * for at fyre 3-4 identiske forespørgsler af sted.
 */
const tournamentCache = new Map<string, TournamentConfig>();
const inflight = new Map<string, Promise<TournamentConfig>>();

/**
 * Henter turneringen for et spil via games.tournament_type.
 * Falder tilbage til VM 2026 hvis kolonnen mangler (migration ikke kørt)
 * eller spillet ikke findes. Resultatet caches pr. spil.
 */
export async function getTournamentForGame(gameId: string): Promise<TournamentConfig> {
  const cached = tournamentCache.get(gameId);
  if (cached) return cached;

  const pending = inflight.get(gameId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from("games")
        .select("tournament_type")
        .eq("id", gameId)
        .maybeSingle();
      const cfg =
        error || !data
          ? WC2026
          : getTournament((data as { tournament_type?: string }).tournament_type);
      tournamentCache.set(gameId, cfg);
      return cfg;
    } catch {
      // Fald tilbage til VM 2026, men cache ikke fejlen — så et forbigående
      // netværksudfald kan prøves igen ved næste kald.
      return WC2026;
    } finally {
      inflight.delete(gameId);
    }
  })();

  inflight.set(gameId, promise);
  return promise;
}
