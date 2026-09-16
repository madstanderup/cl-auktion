import type { ScoreMatch } from "@/lib/scoring";
import type { TMatch } from "@/lib/tournament";
import { canBuildBracket, simulateBracket, simulateTeamPoints, buildStrengthMap } from "@/lib/bracket";
import { simulateClTournament, simulateClTeamPoints } from "@/lib/tournaments/cl-sim";
import { calcPointsForTournament, type TournamentConfig } from "@/lib/tournaments";

/**
 * Retrospektive runde-checkpoints: hvordan så turneringen ud efter hver spillet
 * runde? Ved hvert checkpoint låses kampene til og med runden, og resten
 * behandles som uspillede — så en simulering på det tidspunkt giver præcis det
 * estimat, man ville have fået dengang.
 *
 * Bruges af pointsiden (graf), summary (tabel pr. spiller) og
 * holdestimater (tabel pr. hold), så alle tre viser samme runde-inddeling.
 */

export type DatedMatch = ScoreMatch & { match_date?: string | null };

export type RoundCheckpoint = {
  key: string;
  /** Kort label til tabelkolonner: "Start", "3. runde", "1/8". */
  label: string;
  /** Langt label til grafakser: "Efter 3. runde". */
  longLabel: string;
  /** Kampene som de så ud efter runden. */
  matches: DatedMatch[];
};

const WC_STAGES = ["round_of_32", "round_of_16", "quarter_final", "semi_final", "final"];
const CL_STAGES = ["playoff", "round_of_16", "quarter_final", "semi_final", "final"];
const SHORT: Record<string, string> = {
  playoff: "Playoff", round_of_32: "1/16", round_of_16: "1/8",
  quarter_final: "1/4", semi_final: "1/2", final: "Finale",
};
const LONG: Record<string, string> = {
  playoff: "Efter playoff", round_of_32: "Efter 1/16", round_of_16: "Efter 1/8",
  quarter_final: "Efter 1/4", semi_final: "Efter 1/2", final: "Efter finalen",
};

/**
 * Checkpoints for turneringen. Tom liste betyder "ikke noget at vise endnu"
 * (VM før gruppespillet er færdigt, eller ingen spillede kampe i CL).
 */
export function buildRoundCheckpoints(cfg: TournamentConfig, matches: DatedMatch[]): RoundCheckpoint[] {
  if (cfg.id === "cl2627") return clCheckpoints(cfg, matches);
  if (cfg.hasBracket && canBuildBracket(matches as TMatch[])) return bracketCheckpoints(matches);
  return [];
}

/** VM: ét checkpoint efter gruppespillet og ét pr. spillet knockout-runde. */
function bracketCheckpoints(matches: DatedMatch[]): RoundCheckpoint[] {
  const out: RoundCheckpoint[] = [{
    key: "group", label: "Grupper", longLabel: "Efter grupper",
    matches: matches.filter((m) => m.stage === "group"),
  }];
  for (let i = 0; i < WC_STAGES.length; i++) {
    const st = WC_STAGES[i];
    if (!matches.some((m) => m.stage === st && m.status === "finished")) continue;
    const allowed = new Set(["group", ...WC_STAGES.slice(0, i + 1)]);
    out.push({ key: st, label: SHORT[st], longLabel: LONG[st], matches: matches.filter((m) => allowed.has(m.stage)) });
  }
  return out.length >= 2 ? out : [];
}

/**
 * CL: ét checkpoint pr. spillet ligarunde + ét pr. afsluttet knockout-runde.
 * Ligarunden udledes af kampens plads i holdets daterede kampliste — der er
 * ingen rundekolonne i databasen.
 */
function clCheckpoints(cfg: TournamentConfig, allMatches: DatedMatch[]): RoundCheckpoint[] {
  // Stage-navnene ("final", "round_of_16", ...) deles med de andre turneringer i
  // den fælles kamptabel. En fremmed kamp i spillet ville derfor give et
  // checkpoint for en runde der aldrig er spillet — mindst ét hold skal findes
  // i turneringens katalog, før kampen tæller med.
  const matches = allMatches.filter((m) => cfg.findTeam(m.home_team) || cfg.findTeam(m.away_team));
  const canon = (n: string) => (cfg.findTeam(n)?.name ?? n).toLowerCase();
  const leagueMs = matches
    .filter((m) => m.stage === "league" && m.home_team !== "TBD" && m.away_team !== "TBD")
    .sort((a, b) => (a.match_date ?? "").localeCompare(b.match_date ?? ""));

  const perTeamIdx = new Map<string, number>();
  const roundOf = new Map<DatedMatch, number>(); // 0-baseret
  for (const m of leagueMs) {
    let r = 0;
    for (const t of [canon(m.home_team), canon(m.away_team)]) {
      const i = perTeamIdx.get(t) ?? 0;
      r = Math.max(r, i);
      perTeamIdx.set(t, i + 1);
    }
    roundOf.set(m, r);
  }

  const asScheduled = (m: DatedMatch): DatedMatch =>
    ({ ...m, home_score: null, away_score: null, result_type: null, winner_side: null, status: "scheduled" });
  // Runde < k beholdes som spillet; resten planlagt; knockout droppes
  const leagueTrunc = (k: number) =>
    leagueMs.map((m) => (m.status === "finished" && (roundOf.get(m) ?? 0) < k ? m : asScheduled(m)));

  const out: RoundCheckpoint[] = [{ key: "start", label: "Start", longLabel: "Start", matches: leagueTrunc(0) }];
  for (let k = 1; k <= cfg.leagueRounds; k++) {
    if (!leagueMs.some((m) => m.status === "finished" && (roundOf.get(m) ?? 0) === k - 1)) continue;
    out.push({ key: `league${k}`, label: `${k}. runde`, longLabel: `Efter ${k}. runde`, matches: leagueTrunc(k) });
  }
  for (let i = 0; i < CL_STAGES.length; i++) {
    const st = CL_STAGES[i];
    if (!matches.some((m) => m.stage === st && m.status === "finished")) continue;
    const allowed = new Set(["league", ...CL_STAGES.slice(0, i + 1)]);
    out.push({ key: st, label: SHORT[st], longLabel: LONG[st], matches: matches.filter((m) => allowed.has(m.stage)) });
  }
  return out.length >= 2 ? out : [];
}

/** Færre iterationer end live-estimatet: ét checkpoint pr. runde koster hurtigt. */
function defaultN(cfg: TournamentConfig): number {
  return cfg.id === "cl2627" ? 3000 : 4000;
}

/**
 * Forventet slutpoint pr. spiller ved hvert checkpoint.
 * Nøgle: player_id · værdi: ét afrundet estimat pr. checkpoint.
 */
export function estimatePlayerPointsPerRound(
  cfg: TournamentConfig,
  checkpoints: RoundCheckpoint[],
  opts: { playerIds: string[]; ownedByPlayer: Map<string, string[]>; ownerByTeam: Map<string, string>; N?: number },
): Map<string, number[]> {
  const { playerIds, ownedByPlayer, ownerByTeam, N = defaultN(cfg) } = opts;
  const values = new Map<string, number[]>(playerIds.map((p) => [p, []]));
  const strength = cfg.id === "cl2627" ? null : buildStrengthMap();

  for (const cp of checkpoints) {
    const basePoints = new Map<string, number>();
    for (const [pid, names] of ownedByPlayer) {
      basePoints.set(pid, names.reduce((s, n) => s + calcPointsForTournament(cfg, n, cp.matches), 0));
    }
    const res = strength
      ? simulateBracket(cp.matches as TMatch[], { playerIds, basePoints, strength, ownerByTeam, N })
      : simulateClTournament(cp.matches, { playerIds, basePoints, ownerByTeam, N });
    for (const pid of playerIds) values.get(pid)!.push(Math.round(res.expectedPoints[pid] ?? 0));
  }
  return values;
}

/**
 * Forventet slutpoint pr. hold ved hvert checkpoint.
 * Nøgle: kanonisk holdnavn i lowercase · værdi: ét estimat pr. checkpoint.
 */
export function estimateTeamPointsPerRound(
  cfg: TournamentConfig,
  checkpoints: RoundCheckpoint[],
  opts: { teamNames: string[]; N?: number },
): Map<string, number[]> {
  const { teamNames, N = defaultN(cfg) } = opts;
  const canon = (n: string) => (cfg.findTeam(n)?.name ?? n).toLowerCase();
  const strength = cfg.id === "cl2627" ? null : buildStrengthMap();
  const values = new Map<string, number[]>(teamNames.map((n) => [canon(n), []]));

  for (const cp of checkpoints) {
    const currentByTeam = new Map<string, number>();
    for (const raw of teamNames) currentByTeam.set(canon(raw), calcPointsForTournament(cfg, raw, cp.matches));
    const est = strength
      ? simulateTeamPoints(cp.matches as TMatch[], { strength, currentByTeam, N })
      : simulateClTeamPoints(cp.matches, { currentByTeam, N });
    for (const raw of teamNames) {
      const key = canon(raw);
      values.get(key)!.push(Math.round(est.get(key) ?? currentByTeam.get(key) ?? 0));
    }
  }
  return values;
}
