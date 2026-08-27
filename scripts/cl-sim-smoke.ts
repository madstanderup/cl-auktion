/**
 * Smoke-test af CL 26/27-simuleringen (kør: npx tsx scripts/cl-sim-smoke.ts).
 * Tester motoren i fire tilstande: tom turnering, midt i ligaen, liga færdig
 * og fuldt afviklet turnering (alt skal være låst → 0 sim-point).
 */
import type { ScoreMatch } from "../src/lib/scoring";
import { CL2627_TEAMS } from "../src/lib/tournaments/cl2627-teams";
import { clLeagueTable, clCalcTeamPoints } from "../src/lib/tournaments/cl-scoring";
import { simulateClTournament, simulateClTeamPoints } from "../src/lib/tournaments/cl-sim";

const names = CL2627_TEAMS.map((t) => t.name);
const N_TEAMS = names.length;
const lower = (n: string) => n.toLowerCase();

function m(stage: string, home: string, away: string, hs: number | null = null, as_: number | null = null): ScoreMatch {
  return {
    home_team: home, away_team: away, stage,
    home_score: hs, away_score: as_,
    result_type: hs !== null ? "regular" : null, winner_side: null,
    status: hs !== null ? "finished" : "scheduled",
  };
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// ── Scenario 1: tom turnering (auktion slut, ingen kampe) ───────────────
{
  const t0 = Date.now();
  const est = simulateClTeamPoints([], { currentByTeam: new Map(), N: 4000 });
  const ms = Date.now() - t0;
  const real = est.get("real madrid") ?? 0;
  const sabah = est.get("sabah fk") ?? 0;
  const sorted = [...est.entries()].sort((a, b) => b[1] - a[1]);
  check(`S1: alle ${N_TEAMS} hold har forventning > 0`, [...est.values()].every((v) => v > 0));
  check("S1: Real Madrid > Sabah FK", real > sabah, `${Math.round(real)} vs ${Math.round(sabah)}`);
  check("S1: stærkeste hold i toppen", sorted[0][1] >= real);
  check("S1: 4000 iterationer < 5s", ms < 5000, `${ms}ms`);
  console.log("     top 5:", sorted.slice(0, 5).map(([n, v]) => `${n}=${Math.round(v)}`).join(", "));

  // Spiller-niveau: 2 spillere, stærke vs svage hold
  const owner = new Map([["bayern münchen", "A"], ["arsenal", "A"], ["lask linz", "B"], ["sabah fk", "B"]]);
  const res = simulateClTournament([], {
    playerIds: ["A", "B"], basePoints: new Map([["A", 0], ["B", 0]]), ownerByTeam: owner, N: 4000,
  });
  const probSum = res.winProb["A"] + res.winProb["B"];
  check("S1: winProb summer til 1", Math.abs(probSum - 1) < 1e-9, probSum.toFixed(4));
  check("S1: stærke hold vinder klart oftest", res.winProb["A"] > 0.95, `A=${res.winProb["A"].toFixed(3)}`);
  check("S1: pairwise konsistent", Math.abs(res.pairwise["A"]["B"] + res.pairwise["B"]["A"] - 1) < 0.01);
  const colSumA = res.placeProb["A"].reduce((s, v) => s + v, 0);
  const rowSum1 = res.placeProb["A"][0] + res.placeProb["B"][0];
  check("S1: placeProb-kolonne summer til 1", Math.abs(colSumA - 1) < 1e-9, colSumA.toFixed(4));
  check("S1: placeProb-række (1. plads) summer til 1", Math.abs(rowSum1 - 1) < 1e-9, rowSum1.toFixed(4));
  check("S1: placeProb[0] matcher winProb", Math.abs(res.placeProb["A"][0] - res.winProb["A"]) < 0.01,
    `${res.placeProb["A"][0].toFixed(3)} vs ${res.winProb["A"].toFixed(3)}`);
}

// ── Scenario 2: midt i ligaen — Sabah FK har vundet 3 kampe ─────────────
{
  const matches: ScoreMatch[] = [
    m("league", "Sabah FK", "Real Madrid", 2, 0),
    m("league", "Sabah FK", "Liverpool", 1, 0),
    m("league", "Sabah FK", "PSG", 3, 1),
    m("league", "Barcelona", "Arsenal"), // planlagt, ikke spillet
  ];
  const cur = clCalcTeamPoints("Sabah FK", matches);
  check("S2: Sabah current = 450 (3 sejre)", cur === 450, String(cur));

  const est = simulateClTeamPoints(matches, { currentByTeam: new Map([["sabah fk", cur]]), N: 4000 });
  const baseline = simulateClTeamPoints([], { currentByTeam: new Map(), N: 4000 });
  const sabahNow = est.get("sabah fk") ?? 0;
  const sabahStart = baseline.get("sabah fk") ?? 0;
  check("S2: Sabah-forventning >= current (låst gulv)", sabahNow >= cur, `${Math.round(sabahNow)} vs ${cur}`);
  check("S2: Sabah-forventning steget markant", sabahNow > sabahStart + 300, `${Math.round(sabahNow)} vs start ${Math.round(sabahStart)}`);
  const realNow = est.get("real madrid") ?? 0;
  const realStart = baseline.get("real madrid") ?? 0;
  check("S2: Real Madrid-forventning faldet", realNow < realStart, `${Math.round(realNow)} vs start ${Math.round(realStart)}`);
}

// ── Hjælper: fuld, konsistent liga (8 runder, cirkelmetoden) ─────────────
// Ved ulige antal hold får ét hold en bye pr. runde (-1 i skemaet).
function fullLeague(): ScoreMatch[] {
  const slots = [...Array(N_TEAMS).keys()];
  if (slots.length % 2 === 1) slots.push(-1);
  const n = slots.length;
  const out: ScoreMatch[] = [];
  let rot = slots.slice(1);
  for (let r = 0; r < 8; r++) {
    const round = [slots[0], ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = round[i], b = round[n - 1 - i];
      if (a < 0 || b < 0) continue; // bye
      // laveste katalogindeks (stærkeste) vinder altid 2-0
      out.push(a < b ? m("league", names[a], names[b], 2, 0) : m("league", names[b], names[a], 2, 0));
    }
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }
  return out;
}

// ── Scenario 3: liga færdig, knockout ikke startet ───────────────────────
{
  const matches = fullLeague();
  const table = clLeagueTable(matches);
  check(`S3: tabel har ${N_TEAMS} hold`, table.length === N_TEAMS);

  const cur = new Map(names.map((n) => [lower(n), clCalcTeamPoints(n, matches)]));
  const est = simulateClTeamPoints(matches, { currentByTeam: cur, N: 4000 });

  // nr. 25 og nedefter er ude — forventning skal være låst på current
  const outOk = table.slice(24).every((r) => Math.abs((est.get(r.name) ?? 0) - (cur.get(r.name) ?? 0)) < 1e-9);
  check(`S3: nr. 25-${N_TEAMS} får ingen sim-point`, outOk);
  // top 8 får ikke top8-bonus igen i sim (ligger i current)
  const no1 = table[0].name;
  check("S3: nr. 1 forventning >= current + knockout-udbytte", (est.get(no1) ?? 0) > (cur.get(no1) ?? 0) + 200,
    `${Math.round(est.get(no1) ?? 0)} vs current ${cur.get(no1)}`);
  // nr. 9-24 kan stadig score (playoff-bonus + evt. videre)
  const no9 = table[8].name;
  check("S3: nr. 9 kan stadig score", (est.get(no9) ?? 0) > (cur.get(no9) ?? 0));
}

// ── Scenario 4: fuldt afviklet turnering — alt låst, 0 sim-point ─────────
{
  const matches = fullLeague();
  const table = clLeagueTable(matches);
  const byRank = (r: number) => names.find((n) => lower(n) === table[r - 1].name)!;

  // playoff: 9v24, 10v23, ... 16v17 — bedst placerede vinder begge ben 1-0
  const winners: Record<string, string[]> = {};
  const playTie = (stage: string, A: string, B: string, legs: number) => {
    for (let l = 0; l < legs; l++) matches.push(l % 2 === 0 ? m(stage, A, B, 1, 0) : m(stage, B, A, 0, 1));
    (winners[stage] ??= []).push(A);
  };
  for (let i = 0; i < 8; i++) playTie("playoff", byRank(9 + i), byRank(24 - i), 2);
  // 1/8: seed s vs playoff-vinder; lad seeds vinde
  for (let s = 1; s <= 8; s++) playTie("round_of_16", byRank(s), winners["playoff"][s - 1], 2);
  const r16w = winners["round_of_16"]; // = seeds 1..8
  playTie("quarter_final", r16w[0], r16w[7], 2);
  playTie("quarter_final", r16w[2], r16w[4], 2);
  playTie("quarter_final", r16w[1], r16w[6], 2);
  playTie("quarter_final", r16w[3], r16w[5], 2);
  const qfw = winners["quarter_final"];
  playTie("semi_final", qfw[0], qfw[1], 2);
  playTie("semi_final", qfw[2], qfw[3], 2);
  playTie("final", winners["semi_final"][0], winners["semi_final"][1], 1);

  const cur = new Map(names.map((n) => [lower(n), clCalcTeamPoints(n, matches)]));
  const est = simulateClTeamPoints(matches, { currentByTeam: cur, N: 500 });
  const maxDiff = Math.max(...names.map((n) => Math.abs((est.get(lower(n)) ?? 0) - (cur.get(lower(n)) ?? 0))));
  check("S4: færdig turnering → est == current for alle", maxDiff < 1e-9, `maxDiff=${maxDiff}`);

  // Spiller-niveau: den der ejer mesteren + nr. 2 skal vinde 100 %
  const champ = lower(winners["final"][0]);
  const other = names.map(lower).find((n) => n !== champ)!;
  const basePoints = new Map([["A", cur.get(champ)!], ["B", cur.get(other)!]]);
  const res = simulateClTournament(matches, {
    playerIds: ["A", "B"], basePoints,
    ownerByTeam: new Map([[champ, "A"], [other, "B"]]), N: 500,
  });
  check("S4: mesterens ejer vinder 100%", res.winProb["A"] === 1, `A=${res.winProb["A"]}`);
  check("S4: forventet slutpoint = faktiske point", res.expectedPoints["A"] === cur.get(champ), String(res.expectedPoints["A"]));
  check("S4: placeringer helt låst", res.placeProb["A"][0] === 1 && res.placeProb["A"][1] === 0 && res.placeProb["B"][1] === 1,
    `A=[${res.placeProb["A"].join(",")}] B=[${res.placeProb["B"].join(",")}]`);
}

// ── Scenario 5: fuldt kampprogram, alt "planlagt" (grafens Start-checkpoint) ──
{
  const scheduled = fullLeague().map((x) => ({
    ...x, home_score: null, away_score: null, result_type: null, winner_side: null, status: "scheduled",
  }));
  const est = simulateClTeamPoints(scheduled, { currentByTeam: new Map(), N: 4000 });
  const sorted = [...est.entries()].sort((a, b) => b[1] - a[1]);
  check("S5: alle hold har forventning > 0 med rent kampprogram", [...est.values()].every((v) => v > 0));
  check("S5: Bayern München i top 3", sorted.slice(0, 3).some(([n]) => n === "bayern münchen"),
    sorted.slice(0, 3).map(([n]) => n).join(", "));
  // Med kendt kampprogram skal niveauet ligne fantom-baseline (S1)
  const baseline = simulateClTeamPoints([], { currentByTeam: new Map(), N: 4000 });
  const bayern = est.get("bayern münchen")!, bayernBase = baseline.get("bayern münchen")!;
  check("S5: niveau ligner fantom-baseline (±20%)", Math.abs(bayern - bayernBase) / bayernBase < 0.2,
    `${Math.round(bayern)} vs ${Math.round(bayernBase)}`);
}

console.log(failures === 0 ? "\nAlle checks bestået ✔" : `\n${failures} check(s) FEJLEDE ✘`);
process.exit(failures === 0 ? 0 : 1);
