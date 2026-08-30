/**
 * Smoke-test af UEFA-parseren (kør: npx tsx scripts/cl-uefa-smoke.ts).
 *
 * Første del kalder UEFA's rigtige API og tjekker, at antagelserne bag
 * cl-uefa.ts stadig holder — at ligafasen hedder det den gør, at kvalifikationen
 * ikke smutter med, og at parringerne matcher det trukne kampprogram.
 * Anden del kører opdigtede kampe gennem parseren, fordi der endnu ikke findes
 * spillede CL-kampe at teste resultatmapningen på.
 */
import { parseUefaMatch, mapStage, type UefaMatch } from "../src/lib/tournaments/cl-uefa";
import { CL2627_LEAGUE_FIXTURES } from "../src/lib/tournaments/cl2627-fixtures";
import { findCL2627Team } from "../src/lib/tournaments/cl2627-teams";

const URL = "https://match.uefa.com/v5/matches?competitionId=1&seasonYear=2027&limit=500&offset=0";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const canon = (n: string) => (findCL2627Team(n)?.name ?? n).toLowerCase();

// ── Del 1: mod det rigtige API ──────────────────────────────────────────
async function apiChecks() {
  const res = await fetch(URL, { headers: { "x-requested-with": "uefa.com" } });
  if (!res.ok) {
    console.log(`FAIL  UEFA svarede HTTP ${res.status} — resten af API-testen springes over`);
    process.exit(1);
  }
  const all = (await res.json()) as UefaMatch[];
  const tournament = all.filter((m) => m.competitionPhase === "TOURNAMENT");
  const qualifying = all.filter((m) => m.competitionPhase === "QUALIFYING");
  check("API: turneringsfasen har 144 kampe", tournament.length === 144, String(tournament.length));

  const parsed = tournament.map(parseUefaMatch);
  const ok = parsed.filter((p) => p !== null);
  check("API: alle turneringskampe kan mappes", ok.length === tournament.length,
    `${ok.length}/${tournament.length}`);

  const league = ok.filter((p) => p!.stage === "league");
  check("API: 144 ligakampe", league.length === 144, String(league.length));
  check("API: alle ligakampe har dato", league.every((p) => p!.matchDate !== null));
  check("API: alle ligakampe er planlagt eller spillet",
    league.every((p) => ["scheduled", "live", "finished"].includes(p!.status)));

  const names = new Set(league.flatMap((p) => [p!.rawHome, p!.rawAway]));
  const unmatched = [...names].filter((n) => !findCL2627Team(n));
  check("API: alle holdnavne findes i kataloget", unmatched.length === 0, unmatched.join(", "));
  check("API: 36 hold", names.size === 36, String(names.size));

  const ours = new Set(CL2627_LEAGUE_FIXTURES.map(([h, a]) => `${canon(h)}|${canon(a)}`));
  const theirs = new Set(league.map((p) => `${canon(p!.rawHome)}|${canon(p!.rawAway)}`));
  const diff = [...ours].filter((k) => !theirs.has(k));
  check("API: parringer og hjemme/ude matcher kampprogrammet", diff.length === 0,
    diff.slice(0, 3).join(" / "));

  // Kvalifikationens egen "Play-Offs"-runde må ALDRIG blive til vores playoff
  const qualPlayoffs = qualifying.filter((m) => (m.round?.metaData?.name ?? "").toLowerCase().includes("play"));
  check("API: kvalifikationen har en Play-Offs-runde der skal filtreres fra", qualPlayoffs.length > 0,
    `${qualPlayoffs.length} kampe`);
  check("API: den runde mappes til playoff og fanges derfor kun af competitionPhase-filteret",
    mapStage(qualPlayoffs[0]?.round?.metaData?.name, qualPlayoffs[0]?.round?.metaData?.type) === "playoff");
}

// ── Del 2: resultatmapning på opdigtede kampe ───────────────────────────
const base = (score: UefaMatch["score"], extra: Partial<UefaMatch> = {}): UefaMatch => ({
  id: "x", competitionPhase: "TOURNAMENT", status: "FINISHED",
  homeTeam: { id: "H", internationalName: "Arsenal" },
  awayTeam: { id: "A", internationalName: "PSG" },
  round: { metaData: { name: "Round of 16", type: "KNOCK_OUT" } },
  kickOffTime: { dateTime: "2027-03-10T20:00:00Z" },
  score, ...extra,
});

function offlineChecks() {
{
  const p = parseUefaMatch(base({ regular: { home: 2, away: 1 }, total: { home: 2, away: 1 } }))!;
  check("Sejr i ordinær tid: 2-1, normal_time", p.homeScore === 2 && p.awayScore === 1 && p.resultType === "normal_time" && p.winnerSide === null);
  check("Sejr i ordinær tid: stage round_of_16", p.stage === "round_of_16");
}
{
  const p = parseUefaMatch(base({ regular: { home: 1, away: 1 }, total: { home: 2, away: 1 } }))!;
  check("Forlænget afgjort på mål: total gemmes, extra_time", p.homeScore === 2 && p.resultType === "extra_time" && p.winnerSide === null);
}
{
  const p = parseUefaMatch(base(
    { regular: { home: 1, away: 1 }, total: { home: 1, away: 1 }, penalty: { home: 3, away: 4 } },
    { winner: { aggregate: { reason: "WIN_ON_PENALTIES" } } }))!;
  check("Straffe: penalties + winner_side away", p.resultType === "penalties" && p.winnerSide === "away" && p.homeScore === 1);
}
{
  // Forlænget uden mål, derefter straffe — kun aggregate.reason afslører ET
  const p = parseUefaMatch(base(
    { regular: { home: 0, away: 0 }, total: { home: 0, away: 0 }, penalty: { home: 5, away: 3 } },
    { winner: { aggregate: { reason: "WIN_ON_PENALTIES" } } }))!;
  check("Målløs forlænget + straffe: penalties, winner home", p.resultType === "penalties" && p.winnerSide === "home");
}
{
  const p = parseUefaMatch(base({ regular: { home: 1, away: 1 }, total: { home: 1, away: 1 } }, {
    playerEvents: { scorers: [
      { goalType: "SCORED", phase: "FIRST_HALF", teamId: "H", time: { minute: 12 }, player: { internationalName: "Saka", clubId: "H" } },
      { goalType: "OWN",    phase: "SECOND_HALF", teamId: "H", time: { minute: 70 }, player: { internationalName: "Saliba", clubId: "H" } },
    ] },
  }))!;
  check("Målscorere: eget mål til home", p.goals?.[0].team === "home" && p.goals?.[0].scorer === "Saka" && p.goals?.[0].minute === 12);
  check("Målscorere: selvmål tælles for modstanderen", p.goals?.[1].team === "away" && p.goals?.[1].scorer === "Saliba (selvmål)");
}
{
  check("Ukendt runde springes over", parseUefaMatch(base({}, { round: { metaData: { name: "Super Cup" } } })) === null);
  check("Ligafasen kendes på type", mapStage("League Phase", "GROUP_STANDINGS") === "league");
  check("Kvartfinale forveksles ikke med finalen", mapStage("Quarter-finals", "KNOCK_OUT") === "quarter_final");
  check("Semifinale forveksles ikke med finalen", mapStage("Semi-finals", "KNOCK_OUT") === "semi_final");
  check("Finalen", mapStage("Final", "KNOCK_OUT") === "final");
  check("Knockout play-offs", mapStage("Knockout Play-offs", "KNOCK_OUT") === "playoff");
}
{
  const p = parseUefaMatch(base({ regular: { home: 0, away: 0 }, total: { home: 0, away: 0 } }, { status: "UPCOMING" }))!;
  check("UPCOMING bliver scheduled", p.status === "scheduled");
}
}

main();

async function main() {
  await apiChecks();
  offlineChecks();
  console.log(failures === 0 ? "\nAlle checks bestået ✔" : `\n${failures} check(s) FEJLEDE ✘`);
  process.exit(failures === 0 ? 0 : 1);
}
