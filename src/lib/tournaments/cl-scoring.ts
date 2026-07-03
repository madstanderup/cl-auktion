import type { ScoreMatch } from "@/lib/scoring";
import { findCL2627Team } from "./cl2627-teams";

/**
 * CL 26/27 pointmotor.
 *
 * Struktur: ligafase (36 hold, 8 kampe hver, enkeltkampe) → top 8 direkte
 * til 1/8; nr. 9-24 i playoff (1/16, dobbeltopgør); derefter 1/8, kvart og
 * semi som dobbeltopgør og finalen som enkeltkamp.
 *
 * Pointregler:
 *  - Ligakampe: sejr 150, uafgjort 50, nederlag 0.
 *  - Playoff (1/16) tæller IKKE: ingen kamppoint, ingen bonus for at være der
 *    (det må ikke være en ulempe at kvalificere sig direkte til 1/8).
 *  - Knockout-kampe fra 1/8 og frem: sejr 150 pr. kamp, uafgjort 50;
 *    forlænget/straffe (kun mulig i det afgørende opgør): begge 50, vinder +50.
 *  - Kvalifikations-bonusser (kumulativt 100/200/400/600/800):
 *      Nå 1/8:      +100  (top 8 i ligaen ved ligafasens afslutning,
 *                          ELLER ved sejr i playoff-opgøret)
 *      Nå kvart:    +100  (ved sejr i 1/8-opgøret)
 *      Nå semi:     +200  (ved sejr i kvart-opgøret)
 *      Nå finalen:  +200  (ved sejr i semi-opgøret)
 *      Mester:      +200  (ved sejr i finalen)
 */

export const CL_STAGES = ["league", "playoff", "round_of_16", "quarter_final", "semi_final", "final"] as const;

export const CL_LEAGUE_WIN = 150;
export const CL_LEAGUE_DRAW = 50;
export const CL_KO_WIN = 150;
export const CL_KO_DRAW = 50;
export const CL_ET_WIN = 50;
export const CL_TOP8_BONUS = 100;
/** Bonus ved sejr i OPGØRET (ikke pr. kamp). */
export const CL_QUAL_ON_TIE_WIN: Record<string, number> = {
  playoff: 100,       // kvalificeret til 1/8
  round_of_16: 100,   // kvartfinale
  quarter_final: 200, // semifinale
  semi_final: 200,    // finalen
  final: 200,         // mester
};
/** Runder der spilles som dobbeltopgør. */
const TWO_LEGGED = new Set(["playoff", "round_of_16", "quarter_final", "semi_final"]);

const canon = (n: string) => findCL2627Team(n)?.name ?? n;
const canonLower = (n: string) => canon(n).toLowerCase();

type LeagueRow = { name: string; pts: number; gd: number; gf: number };

/** Ligatabellen (fodbold-point 3/1/0, målforskel, scorede mål). */
export function clLeagueTable(matches: ScoreMatch[]): LeagueRow[] {
  const table = new Map<string, LeagueRow>();
  const ensure = (n: string): LeagueRow => {
    const key = canonLower(n);
    let r = table.get(key);
    if (!r) { r = { name: key, pts: 0, gd: 0, gf: 0 }; table.set(key, r); }
    return r;
  };
  for (const m of matches) {
    if (m.stage !== "league" || m.status !== "finished") continue;
    const H = ensure(m.home_team), A = ensure(m.away_team);
    const hs = m.home_score ?? 0, as_ = m.away_score ?? 0;
    H.gf += hs; A.gf += as_; H.gd += hs - as_; A.gd += as_ - hs;
    if (hs > as_) H.pts += 3; else if (as_ > hs) A.pts += 3; else { H.pts += 1; A.pts += 1; }
  }
  return [...table.values()].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

export function isLeagueComplete(matches: ScoreMatch[]): boolean {
  const league = matches.filter((m) => m.stage === "league");
  return league.length > 0 && league.every((m) => m.status === "finished");
}

/** Top 8 i ligaen (kanoniske navne, lowercase) — kun når ligafasen er slut. */
export function clLeagueTop8(matches: ScoreMatch[]): Set<string> {
  if (!isLeagueComplete(matches)) return new Set();
  return new Set(clLeagueTable(matches).slice(0, 8).map((r) => r.name));
}

function legWinner(m: ScoreMatch, forHome: boolean): "won" | "lost" | "draw" {
  if (m.result_type === "penalties" && m.winner_side) {
    const w = (forHome && m.winner_side === "home") || (!forHome && m.winner_side === "away");
    return w ? "won" : "lost";
  }
  const my = forHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
  const op = forHome ? (m.away_score ?? 0) : (m.home_score ?? 0);
  return my > op ? "won" : my < op ? "lost" : "draw";
}

/**
 * Afgør et dobbeltopgør (eller finalen) for en runde mellem to hold.
 * Returnerer vinderens kanoniske navn (lowercase) eller null hvis uafgjort/uafsluttet.
 */
export function clTieWinner(stage: string, teamA: string, teamB: string, matches: ScoreMatch[]): string | null {
  const a = canonLower(teamA), b = canonLower(teamB);
  const legs = matches.filter((m) =>
    m.stage === stage && m.status === "finished" &&
    ((canonLower(m.home_team) === a && canonLower(m.away_team) === b) ||
     (canonLower(m.home_team) === b && canonLower(m.away_team) === a)),
  );
  const needed = TWO_LEGGED.has(stage) ? 2 : 1;
  if (legs.length < needed) return null;

  // Straffe i det afgørende opgør vinder over alt andet
  for (const m of legs) {
    if (m.result_type === "penalties" && m.winner_side) {
      return m.winner_side === "home" ? canonLower(m.home_team) : canonLower(m.away_team);
    }
  }
  let aGoals = 0, bGoals = 0;
  for (const m of legs) {
    const hIsA = canonLower(m.home_team) === a;
    aGoals += hIsA ? (m.home_score ?? 0) : (m.away_score ?? 0);
    bGoals += hIsA ? (m.away_score ?? 0) : (m.home_score ?? 0);
  }
  if (aGoals > bGoals) return a;
  if (bGoals > aGoals) return b;
  return null; // sammenlagt uafgjort uden straffe-markering — uafklaret
}

/**
 * Point for ét hold i én kamp (til visning pr. kamp).
 * Playoff giver 0. Kval-bonus ved opgørssejr vises på det AFGØRENDE ben
 * (2. ben / finalen), så dagens point stemmer med totalerne.
 */
export function clTeamMatchPoints(m: ScoreMatch, isHome: boolean, allMatches: ScoreMatch[]): number {
  if (m.status !== "finished" || m.home_score === null || m.away_score === null) return 0;
  if (m.stage === "league") {
    const r = legWinner(m, isHome);
    return r === "won" ? CL_LEAGUE_WIN : r === "draw" ? CL_LEAGUE_DRAW : 0;
  }
  const me = canonLower(isHome ? m.home_team : m.away_team);
  const opp = isHome ? m.away_team : m.home_team;

  let pts = 0;
  if (m.stage !== "playoff") {
    const isET = m.result_type === "extra_time" || m.result_type === "penalties";
    const r = legWinner(m, isHome);
    if (isET) { pts += CL_KO_DRAW; if (r === "won") pts += CL_ET_WIN; }
    else pts += r === "won" ? CL_KO_WIN : r === "draw" ? CL_KO_DRAW : 0;
  }

  // Kval-bonus på det afgørende ben: kampen er "sidste" ben hvis opgøret er
  // komplet og denne kamp er den senest afviklede i opgøret (eller finalen).
  const legs = allMatches.filter((x) =>
    x.stage === m.stage && x.status === "finished" &&
    ((canonLower(x.home_team) === me && canonLower(x.away_team) === canonLower(opp)) ||
     (canonLower(x.home_team) === canonLower(opp) && canonLower(x.away_team) === me)),
  );
  const needed = TWO_LEGGED.has(m.stage) ? 2 : 1;
  if (legs.length >= needed && legs[legs.length - 1] === m) {
    if (clTieWinner(m.stage, isHome ? m.home_team : m.away_team, opp, allMatches) === me) {
      pts += CL_QUAL_ON_TIE_WIN[m.stage] ?? 0;
    }
  }
  return pts;
}

/**
 * Udryddede hold (kanoniske navne, lowercase) — hold der ikke kan score mere:
 *  - nr. 25-36 i ligaen (når ligafasen er slut)
 *  - tabere af afgjorte opgør (playoff → semi)
 *  - begge finalister når finalen er spillet
 */
export function clComputeEliminated(matches: ScoreMatch[]): Set<string> {
  const elim = new Set<string>();

  if (isLeagueComplete(matches)) {
    for (const r of clLeagueTable(matches).slice(24)) elim.add(r.name);
  }

  for (const stage of ["playoff", "round_of_16", "quarter_final", "semi_final", "final"]) {
    // Find alle par i runden
    const pairs = new Map<string, [string, string]>();
    for (const m of matches) {
      if (m.stage !== stage || m.status !== "finished") continue;
      const a = canonLower(m.home_team), b = canonLower(m.away_team);
      pairs.set([a, b].sort().join("|"), [m.home_team, m.away_team]);
    }
    for (const [A, B] of pairs.values()) {
      const w = clTieWinner(stage, A, B, matches);
      if (!w) continue;
      const loser = w === canonLower(A) ? canonLower(B) : canonLower(A);
      elim.add(loser);
      if (stage === "final") elim.add(w); // turneringen er slut
    }
  }
  return elim;
}

/** Samlede CL-point for et hold ud fra alle kampe. */
export function clCalcTeamPoints(teamName: string, matches: ScoreMatch[]): number {
  const me = canonLower(teamName);
  let total = 0;

  // Ligafase: kamppoint + top-8-bonus
  for (const m of matches) {
    if (m.stage !== "league" || m.status !== "finished") continue;
    const isHome = canonLower(m.home_team) === me;
    const isAway = canonLower(m.away_team) === me;
    if (!isHome && !isAway) continue;
    const r = legWinner(m, isHome);
    total += r === "won" ? CL_LEAGUE_WIN : r === "draw" ? CL_LEAGUE_DRAW : 0;
  }
  if (clLeagueTop8(matches).has(me)) total += CL_TOP8_BONUS;

  // Knockout-runder
  for (const stage of ["playoff", "round_of_16", "quarter_final", "semi_final", "final"]) {
    const legs = matches.filter((m) =>
      m.stage === stage && m.status === "finished" &&
      (canonLower(m.home_team) === me || canonLower(m.away_team) === me),
    );
    if (legs.length === 0) continue;

    // Kamppoint pr. kamp — playoff tæller ikke
    if (stage !== "playoff") {
      for (const m of legs) {
        const isHome = canonLower(m.home_team) === me;
        const isET = m.result_type === "extra_time" || m.result_type === "penalties";
        const r = legWinner(m, isHome);
        if (isET) { total += CL_KO_DRAW; if (r === "won") total += CL_ET_WIN; }
        else total += r === "won" ? CL_KO_WIN : r === "draw" ? CL_KO_DRAW : 0;
      }
    }

    // Kvalifikations-bonus ved sejr i opgøret
    const oppRaw = canonLower(legs[0].home_team) === me ? legs[0].away_team : legs[0].home_team;
    if (clTieWinner(stage, teamName, oppRaw, matches) === me) {
      total += CL_QUAL_ON_TIE_WIN[stage] ?? 0;
    }
  }

  return total;
}
