import { computeGroupTables, bestThirdGroups, isGroupStageComplete, canonLower, type TMatch } from "@/lib/tournament";
import { WC2026_TEAMS } from "@/lib/wc2026-teams";

/** Holdstyrke pr. kanonisk navn (lowercase) ud fra forventede point (mean). */
export function buildStrengthMap(): Map<string, number> {
  return new Map(WC2026_TEAMS.map((t) => [t.name.toLowerCase(), t.mean]));
}

// ── FIFA WC2026 bracket ──────────────────────────────────────────────
// R32-slots (kamp 73-88) efter gruppeplacering. Treer-slottene er udfyldt
// for den faktiske kombination #67 (treere fra grupperne B,D,E,F,I,J,K,L).
type SeedRef = { seed: string };          // fx "1A", "2B", "3E"
type WinRef = { win: number };            // vinder af kamp N
type Ref = SeedRef | WinRef;

type BracketNode = { no: number; round: Round; home: Ref; away: Ref };
export type Round = "round_of_32" | "round_of_16" | "quarter_final" | "semi_final" | "final";

/** Forventet kombination af treer-grupper som slot-tildelingen herunder gælder for. */
export const EXPECTED_THIRD_GROUPS = ["B", "D", "E", "F", "I", "J", "K", "L"];

const R32: BracketNode[] = [
  { no: 73, round: "round_of_32", home: { seed: "2A" }, away: { seed: "2B" } },
  { no: 74, round: "round_of_32", home: { seed: "1E" }, away: { seed: "3D" } },
  { no: 75, round: "round_of_32", home: { seed: "1F" }, away: { seed: "2C" } },
  { no: 76, round: "round_of_32", home: { seed: "1C" }, away: { seed: "2F" } },
  { no: 77, round: "round_of_32", home: { seed: "1I" }, away: { seed: "3F" } },
  { no: 78, round: "round_of_32", home: { seed: "2E" }, away: { seed: "2I" } },
  { no: 79, round: "round_of_32", home: { seed: "1A" }, away: { seed: "3E" } },
  { no: 80, round: "round_of_32", home: { seed: "1L" }, away: { seed: "3K" } },
  { no: 81, round: "round_of_32", home: { seed: "1D" }, away: { seed: "3B" } },
  { no: 82, round: "round_of_32", home: { seed: "1G" }, away: { seed: "3I" } },
  { no: 83, round: "round_of_32", home: { seed: "2K" }, away: { seed: "2L" } },
  { no: 84, round: "round_of_32", home: { seed: "1H" }, away: { seed: "2J" } },
  { no: 85, round: "round_of_32", home: { seed: "1B" }, away: { seed: "3J" } },
  { no: 86, round: "round_of_32", home: { seed: "1J" }, away: { seed: "2H" } },
  { no: 87, round: "round_of_32", home: { seed: "1K" }, away: { seed: "3L" } },
  { no: 88, round: "round_of_32", home: { seed: "2D" }, away: { seed: "2G" } },
];

const LATER: BracketNode[] = [
  { no: 89, round: "round_of_16", home: { win: 74 }, away: { win: 77 } },
  { no: 90, round: "round_of_16", home: { win: 73 }, away: { win: 75 } },
  { no: 91, round: "round_of_16", home: { win: 76 }, away: { win: 78 } },
  { no: 92, round: "round_of_16", home: { win: 79 }, away: { win: 80 } },
  { no: 93, round: "round_of_16", home: { win: 83 }, away: { win: 84 } },
  { no: 94, round: "round_of_16", home: { win: 81 }, away: { win: 82 } },
  { no: 95, round: "round_of_16", home: { win: 86 }, away: { win: 88 } },
  { no: 96, round: "round_of_16", home: { win: 85 }, away: { win: 87 } },
  { no: 97, round: "quarter_final", home: { win: 89 }, away: { win: 90 } },
  { no: 98, round: "quarter_final", home: { win: 93 }, away: { win: 94 } },
  { no: 99, round: "quarter_final", home: { win: 91 }, away: { win: 92 } },
  { no: 100, round: "quarter_final", home: { win: 95 }, away: { win: 96 } },
  { no: 101, round: "semi_final", home: { win: 97 }, away: { win: 98 } },
  { no: 102, round: "semi_final", home: { win: 99 }, away: { win: 100 } },
  { no: 104, round: "final", home: { win: 101 }, away: { win: 102 } },
];

const ALL_NODES = [...R32, ...LATER];
const WIN_POINTS = 150;
const LOSER_BONUS: Record<Round, number> = {
  round_of_32: 100, round_of_16: 200, quarter_final: 400, semi_final: 600, final: 800,
};
const FINAL_WINNER_BONUS = 1000;

/** Kan vi konstruere bracket'en? (gruppespil færdigt + treer-kombination matcher skabelonen) */
export function canBuildBracket(matches: TMatch[]): boolean {
  if (!isGroupStageComplete(matches)) return false;
  const grpFin = matches.filter((m) => m.stage === "group" && m.status === "finished");
  const tg = bestThirdGroups(grpFin);
  return tg.length === 8 && tg.join(",") === EXPECTED_THIRD_GROUPS.join(",");
}

/** seed-kode (fx "1A","3E") → kanonisk holdnavn (lowercase). */
function resolveSeeds(matches: TMatch[]): Map<string, string> {
  const tables = computeGroupTables(matches.filter((m) => m.stage === "group" && m.status === "finished"));
  const map = new Map<string, string>();
  for (const [grp, rows] of tables) {
    if (rows[0]) map.set(`1${grp}`, rows[0].name);
    if (rows[1]) map.set(`2${grp}`, rows[1].name);
    if (rows[2]) map.set(`3${grp}`, rows[2].name);
  }
  return map;
}

export type BuiltMatch = { no: number; round: Round; home: string | null; away: string | null };

/** Konstruér R32-matchups (kanoniske navne) til visning. */
export function buildR32(matches: TMatch[]): BuiltMatch[] {
  const seeds = resolveSeeds(matches);
  return R32.map((n) => ({
    no: n.no,
    round: n.round,
    home: "seed" in n.home ? (seeds.get(n.home.seed) ?? null) : null,
    away: "seed" in n.away ? (seeds.get(n.away.seed) ?? null) : null,
  }));
}

export type BracketMatch = {
  no: number;
  round: Round;
  home: string | null;   // kanonisk navn (lowercase) eller null hvis ukendt endnu
  away: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winner: string | null;
};

/** Hele bracket-træet opløst: R32 fra gruppestillinger, senere runder fra spillede resultater. */
export function buildFullBracket(matches: TMatch[]): BracketMatch[] {
  const seeds = resolveSeeds(matches);
  const resultByPair = new Map<string, { winner: string; hs: number; as: number; home: string }>();
  for (const m of matches) {
    if (m.status !== "finished" || m.stage === "group") continue;
    if (m.home_team === "TBD" || m.away_team === "TBD") continue;
    const hc = canonLower(m.home_team), ac = canonLower(m.away_team);
    let winnerHome: boolean;
    if (m.result_type === "penalties" && m.winner_side) winnerHome = m.winner_side === "home";
    else winnerHome = (m.home_score ?? 0) >= (m.away_score ?? 0);
    resultByPair.set([hc, ac].sort().join("|"), { winner: winnerHome ? hc : ac, hs: m.home_score ?? 0, as: m.away_score ?? 0, home: hc });
  }

  const winners = new Map<number, string>();
  const out: BracketMatch[] = [];
  for (const node of ALL_NODES) {
    const home = "seed" in node.home ? (seeds.get(node.home.seed) ?? null) : (winners.get(node.home.win) ?? null);
    const away = "seed" in node.away ? (seeds.get(node.away.seed) ?? null) : (winners.get(node.away.win) ?? null);
    let winner: string | null = null, hs: number | null = null, as: number | null = null;
    if (home && away) {
      const r = resultByPair.get([home, away].sort().join("|"));
      if (r) {
        winner = r.winner;
        winners.set(node.no, winner);
        if (r.home === home) { hs = r.hs; as = r.as; } else { hs = r.as; as = r.hs; }
      }
    }
    out.push({ no: node.no, round: node.round, home, away, homeScore: hs, awayScore: as, winner });
  }
  return out;
}

export type BracketSimResult = {
  winProb: Record<string, number>;
  pairwise: Record<string, Record<string, number>>;
  expectedPoints: Record<string, number>;
};

/**
 * Bracket-bevidst Monte Carlo. Simulerer hver knockout-kamp ud fra holdstyrke
 * (mean), fører vinderen videre, og tildeler point efter reglerne.
 *  - basePoints: spiller → sum af nuværende point for ALLE ejede hold (gruppe m.m.)
 *  - strength:   kanonisk holdnavn (lower) → styrke (mean), bruges til kampsandsynlighed
 *  - ownerByTeam: kanonisk holdnavn (lower) → playerId
 *  - knownResults: "canonA|canonB" (sorteret) → kanonisk vinder (spillede knockout-kampe)
 */
export function simulateBracket(
  matches: TMatch[],
  opts: {
    playerIds: string[];
    basePoints: Map<string, number>;
    strength: Map<string, number>;
    ownerByTeam: Map<string, string>;
    knownResults?: Map<string, string>;
    N?: number;
  },
): BracketSimResult {
  const { playerIds, basePoints, strength, ownerByTeam, knownResults, N = 8000 } = opts;
  const seeds = resolveSeeds(matches);
  const resolve = (ref: Ref, winners: Map<number, string>): string | undefined =>
    "seed" in ref ? seeds.get(ref.seed) : winners.get(ref.win);
  const str = (t: string) => Math.max(1, strength.get(t) ?? 1);

  const wins: Record<string, number> = {};
  const sum: Record<string, number> = {};
  const beats: Record<string, Record<string, number>> = {};
  for (const a of playerIds) { wins[a] = 0; sum[a] = 0; beats[a] = {}; for (const b of playerIds) beats[a][b] = 0; }

  for (let it = 0; it < N; it++) {
    const winners = new Map<number, string>();
    const pts = new Map<string, number>(); // playerId → knockout-point denne iteration

    for (const node of ALL_NODES) {
      const home = resolve(node.home, winners);
      const away = resolve(node.away, winners);
      if (!home || !away) continue;

      let winner: string, loser: string;
      const fixed = knownResults?.get([home, away].sort().join("|"));
      if (fixed) { winner = fixed; loser = fixed === home ? away : home; }
      else {
        const pHome = str(home) / (str(home) + str(away));
        if (Math.random() < pHome) { winner = home; loser = away; }
        else { winner = away; loser = home; }
      }
      winners.set(node.no, winner);

      const wOwner = ownerByTeam.get(winner);
      const lOwner = ownerByTeam.get(loser);
      if (wOwner) pts.set(wOwner, (pts.get(wOwner) ?? 0) + WIN_POINTS + (node.round === "final" ? FINAL_WINNER_BONUS : 0));
      if (lOwner) pts.set(lOwner, (pts.get(lOwner) ?? 0) + LOSER_BONUS[node.round]);
    }

    // Totaler = base + knockout
    let best = -Infinity, bestId = "";
    const totals: Record<string, number> = {};
    for (const pid of playerIds) {
      const t = (basePoints.get(pid) ?? 0) + (pts.get(pid) ?? 0);
      totals[pid] = t;
      sum[pid] += t;
      if (t > best) { best = t; bestId = pid; }
    }
    if (bestId) wins[bestId]++;
    for (const a of playerIds) for (const b of playerIds) if (a !== b && totals[a] > totals[b]) beats[a][b]++;
  }

  const winProb = Object.fromEntries(playerIds.map((id) => [id, wins[id] / N]));
  const expectedPoints = Object.fromEntries(playerIds.map((id) => [id, sum[id] / N]));
  const pairwise: Record<string, Record<string, number>> = {};
  for (const a of playerIds) { pairwise[a] = {}; for (const b of playerIds) pairwise[a][b] = beats[a][b] / N; }
  return { winProb, pairwise, expectedPoints };
}
