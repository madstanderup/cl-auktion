import { findWC2026Team } from "@/lib/wc2026-teams";

// ── Pointmodel (Variant B: progressiv "reach"-tildeling) ──────────────
// Knockout: begge hold får "reach"-bonus for at nå runden; vinderen får
// desuden sejrspoint. Finalevinderen får +200 oveni. Summen pr. hold er
// identisk med den gamle "bonus-til-taber + 1000 til vinder"-model.
export const KNOCKOUT_REACH: Record<string, number> = {
  round_of_32: 100, round_of_16: 100, quarter_final: 200, semi_final: 200, final: 200,
};
export const KNOCKOUT_WIN = 150;       // sejr i ordinær tid
export const ET_BASE = 50;             // uafgjort i ordinær tid (begge hold ved forl./straffe)
export const ET_WIN = 50;              // ekstra til vinderen på forlænget/straffe
export const GROUP_WIN = 150;
export const GROUP_DRAW = 50;
export const FINAL_WINNER_BONUS = 200;

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
  let pts = KNOCKOUT_REACH[m.stage] ?? 0; // begge hold: point for at nå runden
  if (isET) { pts += ET_BASE; if (won) pts += ET_WIN; }
  else if (won) pts += KNOCKOUT_WIN;
  if (m.stage === "final" && won) pts += FINAL_WINNER_BONUS;
  return pts;
}

/** Samlede point for et hold ud fra alle afsluttede kampe (med navne-normalisering). */
export function calcTeamPoints(teamName: string, matches: ScoreMatch[]): number {
  const norm = findWC2026Team(teamName)?.name ?? teamName;
  let total = 0;
  for (const m of matches) {
    if (m.status !== "finished") continue;
    if (m.home_team === norm) total += teamMatchPoints(m, true);
    else if (m.away_team === norm) total += teamMatchPoints(m, false);
  }
  return total;
}
