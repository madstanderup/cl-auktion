import type { ScoreMatch } from "@/lib/scoring";
import { CL2627_TEAMS, findCL2627Team } from "./cl2627-teams";
import {
  clTieWinner, isLeagueComplete, clLeagueTable,
  CL_LEAGUE_WIN, CL_LEAGUE_DRAW, CL_KO_WIN, CL_KO_DRAW, CL_ET_WIN,
  CL_TOP8_BONUS, CL_QUAL_ON_TIE_WIN,
} from "./cl-scoring";

/**
 * CL 26/27 Monte Carlo — simulerer HELE turneringen fra vilkårlig tilstand,
 * også midt i ligafasen. Spillede kampe er låst (point ligger i basePoints/
 * currentByTeam), resten simuleres:
 *
 *  - Ligakampe afgøres med Poisson-mål fordelt efter styrkeforholdet
 *    (mean-værdier), så uafgjort og tabellens tiebreaks (målforskel, scorede
 *    mål) kommer naturligt.
 *  - Mangler der ligakampe i databasen (kampprogrammet er ikke tastet ind
 *    endnu), fyldes hvert holds resterende runder med tilfældige modstandere
 *    pr. iteration, så alle når 8 kampe.
 *  - Efter ligaen: top 8 (+100) direkte til 1/8; nr. 9-24 i playoff; 25-36 ude.
 *  - Knockout følger UEFA's faste træ: playoff-parret (16,17) møder seed 1
 *    osv.; kvartfinaler parres på slots (1,8),(3,5),(2,7),(4,6) og semifinaler
 *    (1,3),(2,4). Lodtrækningens valgmuligheder inden for seedning-par kan
 *    ikke kendes på forhånd — når de rigtige opgør er oprettet i databasen,
 *    bruges de i stedet for de udledte par.
 *  - Delvist spillede opgør (1. ben spillet) fortsættes fra den aggregerede
 *    stilling; afgjorte opgør låses.
 */

const LEAGUE_ROUNDS = 8;
/** Forventet samlet antal mål pr. kamp — fordeles efter styrkeforholdet. */
const GOALS_PER_MATCH = 3.0;
/** Styrke for hold der ikke findes i kataloget. */
const DEFAULT_STRENGTH = 150;

type KOStageDef = { key: string; legs: number; ties: number };
const KO_STAGES: KOStageDef[] = [
  { key: "playoff",       legs: 2, ties: 8 },
  { key: "round_of_16",   legs: 2, ties: 8 },
  { key: "quarter_final", legs: 2, ties: 4 },
  { key: "semi_final",    legs: 2, ties: 2 },
  { key: "final",         legs: 1, ties: 1 },
];
/** Kvartfinaler parres på 1/8-slots; vinderen arver parrets første slot. */
const QF_SLOT_PAIRS: readonly (readonly [number, number])[] = [[1, 8], [3, 5], [2, 7], [4, 6]];
const SF_SLOT_PAIRS: readonly (readonly [number, number])[] = [[1, 3], [2, 4]];

/** Poisson-fordelt måltal (Knuth) — λ er lille (< 3), så løkken er kort. */
function poisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function shuffle(arr: Int32Array): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

/** Reelt opgør fra databasen: låst vinder og/eller aggregeret stilling. */
type ActualTie = { a: number; b: number; winner: number; played: number; aggA: number; aggB: number; slot: number };

type Runner = {
  teamCount: number;
  names: string[];
  idxByName: Map<string, number>;
  runIteration: (simPts: Float64Array) => void;
};

function buildRunner(matches: ScoreMatch[], extraNames: string[]): Runner {
  const canon = (n: string) => (findCL2627Team(n)?.name ?? n).toLowerCase();

  // ── Holdindeks (kanoniske navne, lowercase) ──────────────────────────
  const idxByName = new Map<string, number>();
  const names: string[] = [];
  const strengths: number[] = [];
  const ensure = (raw: string): number => {
    const key = canon(raw);
    let i = idxByName.get(key);
    if (i === undefined) {
      i = names.length;
      idxByName.set(key, i);
      names.push(key);
      strengths.push(Math.max(1, findCL2627Team(key)?.mean ?? DEFAULT_STRENGTH));
    }
    return i;
  };
  for (const t of CL2627_TEAMS) ensure(t.name);
  for (const m of matches) {
    if (m.home_team !== "TBD") ensure(m.home_team);
    if (m.away_team !== "TBD") ensure(m.away_team);
  }
  for (const n of extraNames) ensure(n);

  const T = names.length;
  const strength = Float64Array.from(strengths);

  // ── Ligafase: låst tabel + resterende kampe ──────────────────────────
  const lockedPts = new Int32Array(T), lockedGd = new Int32Array(T), lockedGf = new Int32Array(T);
  const fixtures: number[] = []; // [h,a, h,a, ...] planlagte ligakampe
  const leagueCount = new Int32Array(T);
  for (const m of matches) {
    if (m.stage !== "league" || m.home_team === "TBD" || m.away_team === "TBD") continue;
    const h = ensure(m.home_team), a = ensure(m.away_team);
    leagueCount[h]++; leagueCount[a]++;
    if (m.status === "finished") {
      const hs = m.home_score ?? 0, as_ = m.away_score ?? 0;
      lockedGf[h] += hs; lockedGf[a] += as_;
      lockedGd[h] += hs - as_; lockedGd[a] += as_ - hs;
      if (hs > as_) lockedPts[h] += 3; else if (as_ > hs) lockedPts[a] += 3; else { lockedPts[h] += 1; lockedPts[a] += 1; }
    } else {
      fixtures.push(h, a);
    }
  }
  const leagueDone = isLeagueComplete(matches);

  // Fantomkampe: fyld op til 8 runder pr. hold når kampprogrammet mangler.
  const phantom: number[] = [];
  if (!leagueDone) {
    for (let t = 0; t < T; t++) for (let k = leagueCount[t]; k < LEAGUE_ROUNDS; k++) phantom.push(t);
  }

  // ── Rang-grundlag: færdig ligatabel, ellers styrke (til slot-tildeling) ──
  let actualOrder: Int32Array | null = null;
  if (leagueDone) {
    const seen = new Set<number>();
    const ord: number[] = [];
    for (const r of clLeagueTable(matches)) {
      const i = idxByName.get(r.name);
      if (i !== undefined && !seen.has(i)) { ord.push(i); seen.add(i); }
    }
    const rest: number[] = [];
    for (let i = 0; i < T; i++) if (!seen.has(i)) rest.push(i);
    rest.sort((x, y) => strength[y] - strength[x]);
    actualOrder = Int32Array.from([...ord, ...rest]);
  }
  const baseRank = new Int32Array(T);
  {
    const basis = actualOrder ?? Int32Array.from(Array.from({ length: T }, (_, i) => i).sort((x, y) => strength[y] - strength[x]));
    for (let i = 0; i < T; i++) baseRank[basis[i]] = i;
  }

  // ── Knockout: reelle opgør fra databasen (par, aggregat, afgjort vinder) ──
  const tieMapByStage = new Map<string, Map<string, ActualTie>>();
  const useActual: Record<string, boolean> = {};
  for (const st of KO_STAGES) {
    const map = new Map<string, ActualTie>();
    for (const m of matches) {
      if (m.stage !== st.key || m.home_team === "TBD" || m.away_team === "TBD") continue;
      const h = ensure(m.home_team), a = ensure(m.away_team);
      const key = h < a ? `${h}|${a}` : `${a}|${h}`;
      let tie = map.get(key);
      if (!tie) { tie = { a: h, b: a, winner: -1, played: 0, aggA: 0, aggB: 0, slot: 1 }; map.set(key, tie); }
      if (m.status === "finished") {
        tie.played++;
        const hs = m.home_score ?? 0, as_ = m.away_score ?? 0;
        if (h === tie.a) { tie.aggA += hs; tie.aggB += as_; } else { tie.aggA += as_; tie.aggB += hs; }
      }
    }
    for (const tie of map.values()) {
      const w = clTieWinner(st.key, names[tie.a], names[tie.b], matches);
      if (w !== null) tie.winner = idxByName.get(w) ?? -1;
    }
    // Slots ud fra bedste ligaplacering i opgøret: playoff-parret med den
    // bedst placerede seed (nr. 9) hører til slot 8 (møder seed 8) osv.
    const list = [...map.values()].sort((x, y) =>
      Math.min(baseRank[x.a], baseRank[x.b]) - Math.min(baseRank[y.a], baseRank[y.b]));
    list.forEach((tie, i) => { tie.slot = st.key === "playoff" ? Math.max(1, 8 - i) : i + 1; });
    tieMapByStage.set(st.key, map);
    useActual[st.key] = map.size === st.ties;
  }
  const tieFor = (stage: string, a: number, b: number): ActualTie | undefined =>
    tieMapByStage.get(stage)?.get(a < b ? `${a}|${b}` : `${b}|${a}`);

  // ── Genbrugte buffere til iterationerne ──────────────────────────────
  const pts = new Int32Array(T), gd = new Int32Array(T), gf = new Int32Array(T);
  const orderArr: number[] = Array.from({ length: T }, (_, i) => i);
  const phantomBuf = Int32Array.from(phantom);
  const slotA = new Int32Array(9), slotB = new Int32Array(9);

  function playLeagueMatch(h: number, a: number, simPts: Float64Array): void {
    const sh = strength[h] / (strength[h] + strength[a]);
    const gH = poisson(GOALS_PER_MATCH * sh), gA = poisson(GOALS_PER_MATCH * (1 - sh));
    gf[h] += gH; gf[a] += gA; gd[h] += gH - gA; gd[a] += gA - gH;
    if (gH > gA) { pts[h] += 3; simPts[h] += CL_LEAGUE_WIN; }
    else if (gA > gH) { pts[a] += 3; simPts[a] += CL_LEAGUE_WIN; }
    else { pts[h] += 1; pts[a] += 1; simPts[h] += CL_LEAGUE_DRAW; simPts[a] += CL_LEAGUE_DRAW; }
  }

  /** Spiller/fortsætter et opgør; returnerer vinderens holdindeks. */
  function playTie(st: KOStageDef, a: number, b: number, simPts: Float64Array): number {
    const tie = tieFor(st.key, a, b);
    if (tie && tie.winner >= 0) return tie.winner; // afgjort — point ligger i base

    let aggA = 0, aggB = 0, played = 0;
    if (tie) {
      aggA = a === tie.a ? tie.aggA : tie.aggB;
      aggB = a === tie.a ? tie.aggB : tie.aggA;
      played = tie.played;
    }
    const sh = strength[a] / (strength[a] + strength[b]);
    const isPlayoff = st.key === "playoff"; // playoff giver ingen kamppoint
    let winner = -1;

    for (let leg = played; leg < st.legs; leg++) {
      const gA = poisson(GOALS_PER_MATCH * sh), gB = poisson(GOALS_PER_MATCH * (1 - sh));
      aggA += gA; aggB += gB;
      if (leg === st.legs - 1 && aggA === aggB) {
        // Forlænget/straffe i det afgørende ben: begge 50, vinderen +50
        winner = Math.random() < sh ? a : b;
        if (!isPlayoff) {
          simPts[a] += CL_KO_DRAW; simPts[b] += CL_KO_DRAW; simPts[winner] += CL_ET_WIN;
        }
      } else if (!isPlayoff) {
        if (gA > gB) simPts[a] += CL_KO_WIN;
        else if (gB > gA) simPts[b] += CL_KO_WIN;
        else { simPts[a] += CL_KO_DRAW; simPts[b] += CL_KO_DRAW; }
      }
    }
    if (winner < 0) {
      // Begge ben reelt spillet men uafklaret i data → vægtet møntkast
      winner = aggA > aggB ? a : aggB > aggA ? b : Math.random() < sh ? a : b;
    }
    simPts[winner] += CL_QUAL_ON_TIE_WIN[st.key] ?? 0;
    return winner;
  }

  const cmpTable = (x: number, y: number) =>
    pts[y] - pts[x] || gd[y] - gd[x] || gf[y] - gf[x] || strength[y] - strength[x];

  function runIteration(simPts: Float64Array): void {
    simPts.fill(0);

    // Ligafase
    let order: ArrayLike<number>;
    if (leagueDone) {
      order = actualOrder!; // top-8-bonus ligger allerede i base
    } else {
      pts.set(lockedPts); gd.set(lockedGd); gf.set(lockedGf);
      for (let i = 0; i < fixtures.length; i += 2) playLeagueMatch(fixtures[i], fixtures[i + 1], simPts);
      shuffle(phantomBuf);
      for (let i = 0; i + 1 < phantomBuf.length; i += 2) {
        if (phantomBuf[i] === phantomBuf[i + 1]) {
          let k = i + 2;
          while (k < phantomBuf.length && phantomBuf[k] === phantomBuf[i]) k++;
          if (k >= phantomBuf.length) break;
          const t = phantomBuf[i + 1]; phantomBuf[i + 1] = phantomBuf[k]; phantomBuf[k] = t;
        }
        playLeagueMatch(phantomBuf[i], phantomBuf[i + 1], simPts);
      }
      orderArr.sort(cmpTable);
      order = orderArr;
      for (let i = 0; i < 8; i++) simPts[order[i]] += CL_TOP8_BONUS;
    }

    // Playoff (nr. 9-24) — slotBuf[s] = vinderen der møder seed s i 1/8
    const stPO = KO_STAGES[0], stR16 = KO_STAGES[1], stQF = KO_STAGES[2], stSF = KO_STAGES[3], stF = KO_STAGES[4];
    if (useActual[stPO.key]) {
      for (const tie of tieMapByStage.get(stPO.key)!.values()) slotA[tie.slot] = playTie(stPO, tie.a, tie.b, simPts);
    } else {
      for (let i = 0; i < 8; i++) slotA[8 - i] = playTie(stPO, order[8 + i], order[23 - i], simPts);
    }

    // 1/8-finaler — slotB[s] = vinderen af opgøret med seed s
    if (useActual[stR16.key]) {
      for (const tie of tieMapByStage.get(stR16.key)!.values()) slotB[tie.slot] = playTie(stR16, tie.a, tie.b, simPts);
    } else {
      for (let s = 1; s <= 8; s++) slotB[s] = playTie(stR16, order[s - 1], slotA[s], simPts);
    }

    // Kvartfinaler — vinderen arver parrets første slot (skrives i slotA)
    if (useActual[stQF.key]) {
      for (const tie of tieMapByStage.get(stQF.key)!.values()) slotA[tie.slot] = playTie(stQF, tie.a, tie.b, simPts);
    } else {
      for (const [p, q] of QF_SLOT_PAIRS) slotA[p] = playTie(stQF, slotB[p], slotB[q], simPts);
    }

    // Semifinaler (skrives i slotB) + finale
    if (useActual[stSF.key]) {
      for (const tie of tieMapByStage.get(stSF.key)!.values()) slotB[tie.slot] = playTie(stSF, tie.a, tie.b, simPts);
    } else {
      for (const [p, q] of SF_SLOT_PAIRS) slotB[p] = playTie(stSF, slotA[p], slotA[q], simPts);
    }
    playTie(stF, slotB[1], slotB[2], simPts);
  }

  return { teamCount: T, names, idxByName, runIteration };
}

export type ClSimResult = {
  winProb: Record<string, number>;
  pairwise: Record<string, Record<string, number>>;
  expectedPoints: Record<string, number>;
  /** placeProb[playerId][r] = sandsynlighed for at slutte på placering r+1. */
  placeProb: Record<string, number[]>;
};

/**
 * Spiller-niveau: vindersandsynlighed, parvis matrix og forventet slutpoint.
 *  - basePoints: spiller → sum af nuværende point for alle ejede hold
 *  - ownerByTeam: kanonisk holdnavn (lowercase) → playerId
 */
export function simulateClTournament(
  matches: ScoreMatch[],
  opts: {
    playerIds: string[];
    basePoints: Map<string, number>;
    ownerByTeam: Map<string, string>;
    N?: number;
  },
): ClSimResult {
  const { playerIds, basePoints, ownerByTeam, N = 8000 } = opts;
  const runner = buildRunner(matches, [...ownerByTeam.keys()]);

  const P = playerIds.length;
  const pIdx = new Map(playerIds.map((p, i) => [p, i]));
  const owned: [number, number][] = []; // [holdindeks, spillerindeks]
  for (const [team, pid] of ownerByTeam) {
    const t = runner.idxByName.get(team), p = pIdx.get(pid);
    if (t !== undefined && p !== undefined) owned.push([t, p]);
  }
  const base = playerIds.map((p) => basePoints.get(p) ?? 0);

  const wins = new Float64Array(P), sums = new Float64Array(P);
  const beats = Array.from({ length: P }, () => new Float64Array(P));
  const placeCounts = Array.from({ length: P }, () => new Float64Array(P));
  const rankIdx = Array.from({ length: P }, (_, i) => i);
  const totals = new Float64Array(P);
  const simPts = new Float64Array(runner.teamCount);

  for (let it = 0; it < N; it++) {
    runner.runIteration(simPts);
    for (let p = 0; p < P; p++) totals[p] = base[p];
    for (const [t, p] of owned) totals[p] += simPts[t];

    let best = -Infinity, bestIdx = -1;
    for (let p = 0; p < P; p++) {
      sums[p] += totals[p];
      if (totals[p] > best) { best = totals[p]; bestIdx = p; }
    }
    if (bestIdx >= 0) wins[bestIdx]++;
    for (let a = 0; a < P; a++) for (let b = 0; b < P; b++) if (a !== b && totals[a] > totals[b]) beats[a][b]++;
    rankIdx.sort((a, b) => totals[b] - totals[a]);
    for (let r = 0; r < P; r++) placeCounts[rankIdx[r]][r]++;
  }

  const winProb = Object.fromEntries(playerIds.map((id, i) => [id, wins[i] / N]));
  const expectedPoints = Object.fromEntries(playerIds.map((id, i) => [id, sums[i] / N]));
  const pairwise: Record<string, Record<string, number>> = {};
  for (let a = 0; a < P; a++) {
    pairwise[playerIds[a]] = {};
    for (let b = 0; b < P; b++) pairwise[playerIds[a]][playerIds[b]] = beats[a][b] / N;
  }
  const placeProb = Object.fromEntries(playerIds.map((id, i) => [id, [...placeCounts[i]].map((c) => c / N)]));
  return { winProb, pairwise, expectedPoints, placeProb };
}

/**
 * Hold-niveau: forventet slutpoint pr. hold (kanonisk navn, lowercase) =
 * nuværende point + gennemsnitligt simuleret udbytte af resten af turneringen.
 */
export function simulateClTeamPoints(
  matches: ScoreMatch[],
  opts: { currentByTeam: Map<string, number>; N?: number },
): Map<string, number> {
  const { currentByTeam, N = 10000 } = opts;
  const runner = buildRunner(matches, [...currentByTeam.keys()]);

  const sums = new Float64Array(runner.teamCount);
  const simPts = new Float64Array(runner.teamCount);
  for (let it = 0; it < N; it++) {
    runner.runIteration(simPts);
    for (let t = 0; t < runner.teamCount; t++) sums[t] += simPts[t];
  }

  const out = new Map<string, number>();
  for (let t = 0; t < runner.teamCount; t++) {
    out.set(runner.names[t], (currentByTeam.get(runner.names[t]) ?? 0) + sums[t] / N);
  }
  return out;
}
