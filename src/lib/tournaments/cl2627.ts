import { CL2627_TEAMS, findCL2627Team } from "./cl2627-teams";
import { CL_QUAL_ON_TIE_WIN, CL_TOP8_BONUS } from "./cl-scoring";
import type { TournamentConfig } from "./types";

/**
 * Champions League 26/27.
 * Holdlisten er en DUMMY (25/26-deltagerne) indtil kvalifikationen er
 * afgjort. Pointberegning sker via den dedikerede CL-motor
 * (cl-scoring.ts) — scoring-feltet her er deklarativt til visning.
 */
export const CL2627: TournamentConfig = {
  id: "cl2627",
  label: "Champions League 26/27",
  teamCount: 36,
  teams: CL2627_TEAMS,
  findTeam: findCL2627Team,
  scoring: {
    groupWin: 150,
    groupDraw: 50,
    etBase: 50,
    etWin: 50,
    knockoutWin: 150,
    groupQualBonus: CL_TOP8_BONUS,
    qualOnWin: CL_QUAL_ON_TIE_WIN,
  },
  stages: [
    { key: "league",        label: "Liga" },
    { key: "playoff",       label: "Playoff" },
    { key: "round_of_16",   label: "1/8" },
    { key: "quarter_final", label: "1/4" },
    { key: "semi_final",    label: "1/2" },
    { key: "final",         label: "Finale" },
  ],
  leagueRounds: 8,
  hasBracket: false, // CL-bracket bygges senere (playoff-seedning afhænger af ligaplaceringer)
  twoLeggedKnockout: true,
  syncSource: "none", // Zafronix /uefa/championsleague findes — adapter kobles på når 26/27-data publiceres
};
