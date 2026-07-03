import { WC2026_TEAMS, findWC2026Team } from "@/lib/wc2026-teams";
import { GROUP_WIN, GROUP_DRAW, ET_BASE, ET_WIN, KNOCKOUT_WIN, GROUP_QUAL_BONUS, QUAL_ON_WIN } from "@/lib/scoring";
import type { TournamentConfig } from "./types";

/** VM 2026 — referencekonfigurationen. Peger på de eksisterende moduler,
 *  så adfærden er identisk med før registry'et blev indført. */
export const WC2026: TournamentConfig = {
  id: "wc2026",
  label: "VM 2026",
  teamCount: 48,
  teams: WC2026_TEAMS,
  findTeam: findWC2026Team,
  scoring: {
    groupWin: GROUP_WIN,
    groupDraw: GROUP_DRAW,
    etBase: ET_BASE,
    etWin: ET_WIN,
    knockoutWin: KNOCKOUT_WIN,
    groupQualBonus: GROUP_QUAL_BONUS,
    qualOnWin: QUAL_ON_WIN,
  },
  stages: [
    { key: "group",         label: "Gruppe" },
    { key: "round_of_32",   label: "1/16" },
    { key: "round_of_16",   label: "1/8" },
    { key: "quarter_final", label: "1/4" },
    { key: "semi_final",    label: "1/2" },
    { key: "final",         label: "Finale" },
  ],
  leagueRounds: 3,
  hasBracket: true,
  twoLeggedKnockout: false,
  syncSource: "zafronix-wc2026",
};
