import { findWC2026Team } from "@/lib/wc2026-teams";

export type TMatch = {
  home_team: string; away_team: string; stage: string;
  home_score: number | null; away_score: number | null;
  result_type: string | null; winner_side: string | null; status: string;
};

const KNOCKOUT = new Set(["round_of_32", "round_of_16", "quarter_final", "semi_final", "final"]);

export const canonLower = (n: string) => (findWC2026Team(n)?.name ?? n).toLowerCase();

function knockoutWinner(m: TMatch): "home" | "away" | "draw" {
  if (m.result_type === "penalties" && m.winner_side) return m.winner_side as "home" | "away";
  const h = m.home_score ?? 0, a = m.away_score ?? 0;
  if (h > a) return "home";
  if (a > h) return "away";
  return "draw";
}

export type GroupRow = { name: string; grp: string; pts: number; gd: number; gf: number };

/** Slutstilling pr. gruppe (kanoniske navne, lowercase), sorteret. */
export function computeGroupTables(groupMatches: TMatch[]): Map<string, GroupRow[]> {
  const table = new Map<string, GroupRow>();
  const ensure = (n: string): GroupRow => {
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
  const cmp = (a: GroupRow, b: GroupRow) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
  const groups = new Map<string, GroupRow[]>();
  for (const r of table.values()) {
    const arr = groups.get(r.grp) ?? [];
    arr.push(r);
    groups.set(r.grp, arr);
  }
  for (const arr of groups.values()) arr.sort(cmp);
  return groups;
}

/** Gruppebogstaverne for de 8 bedste treere, sorteret. */
export function bestThirdGroups(groupMatches: TMatch[]): string[] {
  const tables = computeGroupTables(groupMatches);
  const cmp = (a: GroupRow, b: GroupRow) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
  const thirds: GroupRow[] = [];
  for (const arr of tables.values()) if (arr[2]) thirds.push(arr[2]);
  thirds.sort(cmp);
  return thirds.slice(0, 8).map((t) => t.grp).sort();
}

/** Top 2 i hver gruppe + de 8 bedste treere (kanoniske navne, lowercase). */
export function computeGroupAdvancers(groupMatches: TMatch[]): Set<string> {
  const tables = computeGroupTables(groupMatches);
  const cmp = (a: GroupRow, b: GroupRow) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
  const advanced = new Set<string>();
  const thirds: GroupRow[] = [];
  for (const arr of tables.values()) {
    if (arr[0]) advanced.add(arr[0].name);
    if (arr[1]) advanced.add(arr[1].name);
    if (arr[2]) thirds.push(arr[2]);
  }
  thirds.sort(cmp);
  for (const t of thirds.slice(0, 8)) advanced.add(t.name);
  return advanced;
}

/** Er hele gruppespillet færdigspillet? */
export function isGroupStageComplete(matches: TMatch[]): boolean {
  const grp = matches.filter((m) => m.stage === "group");
  const fin = grp.filter((m) => m.status === "finished");
  return grp.length > 0 && fin.length === grp.length;
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
    if (w === "home") elim.add(canonLower(m.away_team));
    else if (w === "away") elim.add(canonLower(m.home_team));
  }

  if (isGroupStageComplete(matches)) {
    const groupFinished = matches.filter((m) => m.stage === "group" && m.status === "finished");
    const advanced = computeGroupAdvancers(groupFinished);
    for (const m of groupFinished) {
      for (const t of [m.home_team, m.away_team]) {
        const cn = canonLower(t);
        if (cn !== "tbd" && !advanced.has(cn)) elim.add(cn);
      }
    }
  }

  return elim;
}

export function isTeamAlive(teamName: string, eliminated: Set<string>): boolean {
  return !eliminated.has(canonLower(teamName));
}

export function countAlive(teamNames: string[], eliminated: Set<string>): number {
  return teamNames.reduce((n, t) => n + (isTeamAlive(t, eliminated) ? 1 : 0), 0);
}
