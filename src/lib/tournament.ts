import { findWC2026Team } from "@/lib/wc2026-teams";

export type TMatch = {
  home_team: string; away_team: string; stage: string;
  home_score: number | null; away_score: number | null;
  result_type: string | null; winner_side: string | null; status: string;
};

const KNOCKOUT = new Set(["round_of_32", "round_of_16", "quarter_final", "semi_final", "final"]);

const canon = (n: string) => (findWC2026Team(n)?.name ?? n).toLowerCase();

function knockoutWinner(m: TMatch): "home" | "away" | "draw" {
  if (m.result_type === "penalties" && m.winner_side) return m.winner_side as "home" | "away";
  const h = m.home_score ?? 0, a = m.away_score ?? 0;
  if (h > a) return "home";
  if (a > h) return "away";
  return "draw";
}

/** Top 2 i hver gruppe + de 8 bedste treere (kanoniske navne, lowercase). */
function computeGroupAdvancers(groupMatches: TMatch[]): Set<string> {
  type Row = { name: string; grp: string; pts: number; gd: number; gf: number };
  const table = new Map<string, Row>();
  const ensure = (n: string): Row => {
    const wc = findWC2026Team(n);
    const key = (wc?.name ?? n).toLowerCase();
    let r = table.get(key);
    if (!r) { r = { name: key, grp: wc?.group ?? "?", pts: 0, gd: 0, gf: 0 }; table.set(key, r); }
    return r;
  };
  for (const m of groupMatches) {
    if (m.home_team === "TBD" || m.away_team === "TBD") continue;
    const H = ensure(m.home_team), A = ensure(m.away_team);
    const hs = m.home_score ?? 0, as_ = m.away_score ?? 0;
    H.gf += hs; A.gf += as_; H.gd += hs - as_; A.gd += as_ - hs;
    if (hs > as_) H.pts += 3; else if (as_ > hs) A.pts += 3; else { H.pts += 1; A.pts += 1; }
  }

  const groups = new Map<string, Row[]>();
  for (const r of table.values()) {
    const arr = groups.get(r.grp) ?? [];
    arr.push(r);
    groups.set(r.grp, arr);
  }
  const cmp = (a: Row, b: Row) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;

  const advanced = new Set<string>();
  const thirds: Row[] = [];
  for (const arr of groups.values()) {
    arr.sort(cmp);
    if (arr[0]) advanced.add(arr[0].name);
    if (arr[1]) advanced.add(arr[1].name);
    if (arr[2]) thirds.push(arr[2]);
  }
  thirds.sort(cmp);
  for (const t of thirds.slice(0, 8)) advanced.add(t.name);
  return advanced;
}

/**
 * Returnerer sæt af kanoniske holdnavne (lowercase) der er slået ud:
 *  - tabere af afgjorte knockout-kampe
 *  - gruppehold der ikke gik videre (kun når hele gruppespillet er færdigt)
 */
export function computeEliminatedTeams(matches: TMatch[]): Set<string> {
  const elim = new Set<string>();

  for (const m of matches) {
    if (m.status !== "finished" || !KNOCKOUT.has(m.stage)) continue;
    const w = knockoutWinner(m);
    if (w === "home") elim.add(canon(m.away_team));
    else if (w === "away") elim.add(canon(m.home_team));
  }

  const groupMatches = matches.filter((m) => m.stage === "group");
  const groupFinished = groupMatches.filter((m) => m.status === "finished");
  if (groupMatches.length > 0 && groupFinished.length === groupMatches.length) {
    const advanced = computeGroupAdvancers(groupFinished);
    for (const m of groupFinished) {
      for (const t of [m.home_team, m.away_team]) {
        const cn = canon(t);
        if (cn !== "tbd" && !advanced.has(cn)) elim.add(cn);
      }
    }
  }

  return elim;
}

/** Er holdet stadig med (ikke slået ud)? */
export function isTeamAlive(teamName: string, eliminated: Set<string>): boolean {
  return !eliminated.has(canon(teamName));
}

/** Antal hold tilbage i en liste af holdnavne. */
export function countAlive(teamNames: string[], eliminated: Set<string>): number {
  return teamNames.reduce((n, t) => n + (isTeamAlive(t, eliminated) ? 1 : 0), 0);
}
