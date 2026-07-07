/**
 * Stabile spillerfarver på tværs af alle oversigter.
 *
 * Farven tildeles efter spillernavn (alfabetisk, dansk sortering) med id som
 * tiebreak — IKKE efter stilling eller sortering på siden. Dermed beholder
 * hver spiller samme farve på spillerkort, grafer og badges, uanset hvordan
 * stillingen udvikler sig.
 *
 * Paletten matcher rækkefølgen i summary-sidens PLAYER_THEMES (amber, emerald,
 * blå, rød, lilla, orange), så temaindeks og hex-farve følges ad.
 */

export const PLAYER_COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f87171", "#a78bfa", "#fb923c"];

/** Stabilt farveindeks pr. spiller-id. */
export function stableColorIndex(players: { id: string; name: string }[]): Map<string, number> {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, "da") || a.id.localeCompare(b.id));
  return new Map(sorted.map((p, i) => [p.id, i]));
}

/** Stabil hex-farve pr. spillernavn (til sider hvor serier er keyet på navn). */
export function colorByPlayerName(players: { id: string; name: string }[]): Map<string, string> {
  const idx = stableColorIndex(players);
  return new Map(players.map((p) => [p.name, PLAYER_COLORS[(idx.get(p.id) ?? 0) % PLAYER_COLORS.length]]));
}
