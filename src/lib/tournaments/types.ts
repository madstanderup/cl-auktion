/** Fælles typer for turnerings-konfigurationer. */

export type TournamentId = "wc2026" | "cl2627";

export type TournamentTeam = {
  name: string;
  group: string;
  mean: number;
  median: number;
  stdDev: number;
  fairPrice: number;
  flag: string;
  aliases: string[];
};

export type ScoringRules = {
  groupWin: number;
  groupDraw: number;
  /** Base ved uafgjort i ordinær tid i knockout (begge hold). */
  etBase: number;
  /** Ekstra til vinderen på forlænget/straffe. */
  etWin: number;
  /** Sejr i ordinær tid i knockout. */
  knockoutWin: number;
  /** Kvalifikation videre fra gruppe-/ligafasen. */
  groupQualBonus: number;
  /** Kvalifikations-bonus tildelt ved sejr i en knockout-runde (stage-key → point). */
  qualOnWin: Record<string, number>;
};

export type StageDef = { key: string; label: string };

export type TournamentConfig = {
  id: TournamentId;
  /** Fuldt navn, fx "VM 2026". */
  label: string;
  /** Antal hold i turneringen. */
  teamCount: number;
  teams: TournamentTeam[];
  findTeam: (name: string) => TournamentTeam | undefined;
  scoring: ScoringRules;
  /** Runder i rækkefølge, inkl. gruppe-/ligafase som første. */
  stages: StageDef[];
  /** Antal kampe pr. hold i gruppe-/ligafasen. */
  leagueRounds: number;
  /** Har turneringen bracket-features (bracket-side, bracket-sim)? */
  hasBracket: boolean;
  /** Spilles knockout-runder som dobbeltopgør? (CL: ja, undtagen finalen) */
  twoLeggedKnockout: boolean;
  /** Resultat-kilde til sync. "none" = kun manuel indtastning. */
  syncSource: "zafronix-wc2026" | "none";
};
