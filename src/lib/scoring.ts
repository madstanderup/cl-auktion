import { findWC2026Team } from "@/lib/wc2026-teams";
import { computeGroupAdvancers, isGroupStageComplete } from "@/lib/tournament";

// ── Pointmodel: progressiv kvalifikations-tildeling ───────────────────
// Point for at nå en runde tildeles ved KVALIFIKATIONEN:
//  - Nå 1/16 (+100): når gruppespillet er slut og holdet er gået videre
//  - Nå 1/8 (+100):  ved sejren i 1/16-finalen
//  - Nå 1/4 (+200):  ved sejren i 1/8-finalen
//  - Nå 1/2 (+200):  ved sejren i kvartfinalen
//  - Nå finalen (+200): ved sejren i semifinalen
//  - Verdensmester (+200): ved sejren i finalen
// Summen pr. hold er identisk med den oprindelige
// "avancement-bonus-til-taber + 1000 til vinder"-model — kun timingen er ny.
export const GROUP_QUAL_BONUS = 100;   // kvalifikation til 1/16 (efter gruppespil)
export const QUAL_ON_WIN: Record<string, number> = {
  round_of_32: 100,  // sejr i 1/16 → kvalificeret til 1/8
  round_of_16: 200,  // sejr i 1/8 → kvartfinale
  quarter_final: 200, // sejr i 1/4 → semifinale
  semi_final: 200,   // sejr i 1/2 → finale
  final: 200,        // sejr i finalen → verdensmester-bonus
};
export const KNOCKOUT_WIN = 150;       // sejr i ordinær tid
export const ET_BASE = 50;             // uafgjort i ordinær tid (begge hold ved forl./straffe)
export const ET_WIN = 50;              // ekstra til vinderen på forlænget/straffe
export const GROUP_WIN = 150;
export const GROUP_DRAW = 50;

export type ScoreMatch = {
  home_team: string; away_team: string; stage: string;
  home_score: number | null; away_score: number | null;
  result_type: string | null; winner_side: string | null; status: string;
};

/** Point for ét hold i én afsluttet kamp (gruppe eller knockout). */
export function teamMatchPoints(m: ScoreMatch, isHome: boolean): number {
  if (m.status !== "finished" || m.home_score === null || m.away_score === null) return 0;
  const my = isHome ? m.home_score : m.away_score;
  const op = isHome ? m.away_score : m.home_score;
  let won = my > op;
  if (m.result_type === "penalties" && m.winner_side) {
    won = (isHome && m.winner_side === "home") || (!isHome && m.winner_side === "away");
  }

  if (m.stage === "group") return my === op ? GROUP_DRAW : won ? GROUP_WIN : 0;

  const isET = m.result_type === "extra_time" || m.result_type === "penalties";
  let pts = 0;
  if (isET) { pts += ET_BASE; if (won) pts += ET_WIN; }
  else if (won) pts += KNOCKOUT_WIN;
  if (won) pts += QUAL_ON_WIN[m.stage] ?? 0; // kvalifikation til næste runde ved sejr
  return pts;
}

/**
 * Kvalifikations-bonus for at gå videre fra gruppespillet (+100).
 * Tildeles først når HELE gruppespillet er færdigspillet (bedste treere
 * kan ikke afgøres før), og kun til hold der gik videre.
 */
export function groupQualBonus(teamName: string, matches: ScoreMatch[]): number {
  if (!isGroupStageComplete(matches)) return 0;
  const norm = (findWC2026Team(teamName)?.name ?? teamName).toLowerCase();
  const advancers = computeGroupAdvancers(matches.filter((m) => m.stage === "group" && m.status === "finished"));
  return advancers.has(norm) ? GROUP_QUAL_BONUS : 0;
}

/** Samlede point for et hold ud fra alle afsluttede kampe (med navne-normalisering). */
export function calcTeamPoints(teamName: string, matches: ScoreMatch[]): number {
  const norm = findWC2026Team(teamName)?.name ?? teamName;
  let total = groupQualBonus(teamName, matches);
  for (const m of matches) {
    if (m.status !== "finished") continue;
    if (m.home_team === norm) total += teamMatchPoints(m, true);
    else if (m.away_team === norm) total += teamMatchPoints(m, false);
  }
  return total;
}
