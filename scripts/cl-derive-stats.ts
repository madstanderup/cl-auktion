/**
 * Genererer SIM_STATS-blokken til src/lib/tournaments/cl2627-teams.ts.
 *
 * Kør:  npx tsx scripts/cl-derive-stats.ts
 * og indsæt outputtet som SIM_STATS i holdkataloget. Kør igen når Elo-tallene
 * eller holdlisten ændres — mean/median/stdDev er rene simuleringsresultater,
 * så auktionens xP og fair pris følger den motor spillet scorer efter.
 */
import { CL2627_TEAMS } from "../src/lib/tournaments/cl2627-teams";
import { simulateClTeamStats } from "../src/lib/tournaments/cl-sim";

const N = Number(process.argv[2] ?? 200_000);

const t0 = Date.now();
const stats = simulateClTeamStats([], { N });
console.error(`Simuleret ${N.toLocaleString("da-DK")} turneringer på ${Date.now() - t0} ms\n`);

const rows = CL2627_TEAMS.map((t) => {
  const s = stats.get(t.name.toLowerCase());
  if (!s) throw new Error(`Ingen simuleringsresultat for ${t.name}`);
  return {
    name: t.name,
    mean: Math.round(s.mean),
    median: s.median,
    stdDev: Math.round(s.stdDev),
  };
});

const total = rows.reduce((sum, r) => sum + r.mean, 0);
console.error(`Sum af mean: ${total} (fordeles på 4.000 mønter)\n`);

const pad = Math.max(...rows.map((r) => JSON.stringify(r.name).length));
const body = rows
  .map((r) => `  ${(JSON.stringify(r.name) + ":").padEnd(pad + 1)} { mean: ${String(r.mean).padStart(4)}, median: ${String(r.median).padStart(4)}, stdDev: ${String(r.stdDev).padStart(3)} },`)
  .join("\n");

console.log(`const SIM_STATS: Record<string, { mean: number; median: number; stdDev: number }> = {\n${body}\n};`);
