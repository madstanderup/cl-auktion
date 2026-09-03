import type { TournamentTeam } from "./types";

/**
 * CL 26/27 — de 36 hold i ligafasen med Elo-rating (pr. 3. september 2026).
 * group er "Liga" for alle — CL har én samlet ligafase.
 *
 * Elo er den ENESTE kilde til holdstyrke: simuleringen (cl-sim.ts) regner den
 * om til en Bradley-Terry-styrke via eloStrength(), så måltallene i en kamp
 * følger Elo-forskellen direkte.
 *
 * mean/median/stdDev herunder er derimod SIMULEREDE slutpoint i CL-pointskalaen
 * — genereret med `npx tsx scripts/cl-derive-stats.ts` og indsat i SIM_STATS,
 * så auktionens xP og fair pris matcher den motor spillet faktisk scorer efter.
 * Genkør scriptet og indsæt outputtet, hvis Elo-tallene opdateres.
 */
const RAW: { name: string; elo: number; flag: string; aliases: string[] }[] = [
  { name: "Bayern München",     elo: 2005, flag: "🇩🇪", aliases: ["Bayern Munich", "FC Bayern", "Bayern", "FC Bayern München"] },
  { name: "Arsenal",            elo: 1985, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Arsenal FC"] },
  { name: "PSG",                elo: 1922, flag: "🇫🇷", aliases: ["Paris Saint-Germain", "Paris SG", "Paris"] },
  { name: "Barcelona",          elo: 1933, flag: "🇪🇸", aliases: ["FC Barcelona", "Barca", "Barça"] },
  { name: "Real Madrid",        elo: 1907, flag: "🇪🇸", aliases: ["Real Madrid CF"] },
  { name: "Manchester City",    elo: 1945, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Man City", "Manchester City FC"] },
  { name: "Inter",              elo: 1835, flag: "🇮🇹", aliases: ["Inter Milan", "Internazionale", "FC Internazionale"] },
  { name: "Manchester United",  elo: 1804, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Man United", "Man Utd", "Manchester Utd", "Manchester United FC"] },
  { name: "Aston Villa",        elo: 1796, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Aston Villa FC", "Villa"] },
  { name: "Borussia Dortmund",  elo: 1787, flag: "🇩🇪", aliases: ["Dortmund", "BVB", "B. Dortmund"] },
  { name: "Sporting CP",        elo: 1786, flag: "🇵🇹", aliases: ["Sporting", "Sporting Lissabon", "Sporting Lisbon"] },
  { name: "AS Roma",            elo: 1761, flag: "🇮🇹", aliases: ["Roma", "Rom"] },
  { name: "Como",               elo: 1711, flag: "🇮🇹", aliases: ["Como 1907", "Como FC"] },
  { name: "Liverpool",          elo: 1834, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Liverpool FC"] },
  { name: "PSV",                elo: 1748, flag: "🇳🇱", aliases: ["PSV Eindhoven"] },
  { name: "Atlético Madrid",    elo: 1789, flag: "🇪🇸", aliases: ["Atletico Madrid", "Atlético", "Atletico", "Atleti"] },
  { name: "FC Porto",           elo: 1750, flag: "🇵🇹", aliases: ["Porto"] },
  { name: "Napoli",             elo: 1727, flag: "🇮🇹", aliases: ["SSC Napoli"] },
  { name: "VfB Stuttgart",      elo: 1713, flag: "🇩🇪", aliases: ["Stuttgart"] },
  { name: "Club Brugge",        elo: 1726, flag: "🇧🇪", aliases: ["Club Bruges", "Brugge"] },
  { name: "RB Leipzig",         elo: 1739, flag: "🇩🇪", aliases: ["Leipzig", "RasenBallsport Leipzig"] },
  { name: "Bodø/Glimt",         elo: 1760, flag: "🇳🇴", aliases: ["Bodo/Glimt", "Bodø Glimt", "Bodo Glimt", "FK Bodø/Glimt"] },
  { name: "RC Lens",            elo: 1731, flag: "🇫🇷", aliases: ["Lens"] },
  { name: "Real Betis",         elo: 1681, flag: "🇪🇸", aliases: ["Betis", "Real Betis Balompié"] },
  { name: "Villarreal",         elo: 1664, flag: "🇪🇸", aliases: ["Villarreal CF"] },
  { name: "Galatasaray",        elo: 1687, flag: "🇹🇷", aliases: ["Galatasaray SK"] },
  { name: "Lille",              elo: 1696, flag: "🇫🇷", aliases: ["LOSC", "LOSC Lille"] },
  { name: "Slavia Praha",       elo: 1690, flag: "🇨🇿", aliases: ["Slavia Prague", "Slavia Prag", "SK Slavia Praha"] },
  { name: "Fenerbahçe",         elo: 1693, flag: "🇹🇷", aliases: ["Fenerbahce", "Fenerbahçe SK"] },
  { name: "Shakhtar Donetsk",   elo: 1568, flag: "🇺🇦", aliases: ["Shakhtar", "FC Shakhtar Donetsk"] },
  { name: "AEK Athen",          elo: 1686, flag: "🇬🇷", aliases: ["AEK Athens", "AEK", "AEK Athina"] },
  { name: "Feyenoord",          elo: 1628, flag: "🇳🇱", aliases: ["Feyenoord Rotterdam"] },
  { name: "Viking FK",          elo: 1645, flag: "🇳🇴", aliases: ["Viking", "Viking Stavanger"] },
  { name: "Slovan Bratislava",  elo: 1521, flag: "🇸🇰", aliases: ["Slovan", "ŠK Slovan Bratislava", "S. Bratislava"] },
  { name: "LASK Linz",          elo: 1594, flag: "🇦🇹", aliases: ["LASK", "LASK Linz FC"] },
  { name: "Sabah FK",           elo: 1477, flag: "🇦🇿", aliases: ["Sabah", "Sabah Baku"] },
];

/**
 * Elo-forskel → styrkeforhold i simuleringen. En forskel på CL_ELO_SCALE point
 * giver 10:1 i forventet målandel. 800 (mod Elo-formlens 400) dæmper udslaget,
 * fordi målscore i en enkelt kamp spreder sig mindre end Elo's forventede score
 * over en hel turnering — udæmpet ville storfavoritter vinde uhørt sikkert.
 */
export const CL_ELO_SCALE = 800;

/** Bradley-Terry-styrke: strength(a)/(strength(a)+strength(b)) = forventet målandel. */
export const eloStrength = (elo: number): number => Math.pow(10, elo / CL_ELO_SCALE);

/**
 * Simuleret slutpointfordeling pr. hold — output fra scripts/cl-derive-stats.ts
 * (200.000 iterationer af det trukne kampprogram + knockout).
 * Genkør scriptet og indsæt outputtet, når RAW ovenfor eller kampprogrammet
 * i cl2627-fixtures.ts ændres.
 */
const SIM_STATS: Record<string, { mean: number; median: number; stdDev: number }> = {
  "Bayern München":    { mean: 1641, median: 1600, stdDev: 643 },
  "Arsenal":           { mean: 1560, median: 1500, stdDev: 634 },
  "PSG":               { mean: 1290, median: 1200, stdDev: 599 },
  "Barcelona":         { mean: 1344, median: 1250, stdDev: 605 },
  "Real Madrid":       { mean: 1258, median: 1150, stdDev: 582 },
  "Manchester City":   { mean: 1334, median: 1250, stdDev: 626 },
  "Inter":             { mean: 1043, median:  950, stdDev: 507 },
  "Manchester United": { mean:  879, median:  750, stdDev: 464 },
  "Aston Villa":       { mean:  821, median:  700, stdDev: 452 },
  "Borussia Dortmund": { mean:  840, median:  750, stdDev: 444 },
  "Sporting CP":       { mean:  804, median:  700, stdDev: 438 },
  "AS Roma":           { mean:  735, median:  650, stdDev: 404 },
  "Como":              { mean:  593, median:  500, stdDev: 333 },
  "Liverpool":         { mean: 1022, median:  950, stdDev: 511 },
  "PSV":               { mean:  741, median:  650, stdDev: 396 },
  "Atlético Madrid":   { mean:  773, median:  650, stdDev: 436 },
  "FC Porto":          { mean:  747, median:  650, stdDev: 400 },
  "Napoli":            { mean:  667, median:  600, stdDev: 361 },
  "VfB Stuttgart":     { mean:  693, median:  600, stdDev: 362 },
  "Club Brugge":       { mean:  617, median:  550, stdDev: 354 },
  "RB Leipzig":        { mean:  674, median:  600, stdDev: 374 },
  "Bodø/Glimt":        { mean:  727, median:  650, stdDev: 403 },
  "RC Lens":           { mean:  621, median:  550, stdDev: 358 },
  "Real Betis":        { mean:  547, median:  500, stdDev: 298 },
  "Villarreal":        { mean:  536, median:  450, stdDev: 290 },
  "Galatasaray":       { mean:  537, median:  450, stdDev: 303 },
  "Lille":             { mean:  570, median:  500, stdDev: 315 },
  "Slavia Praha":      { mean:  561, median:  500, stdDev: 308 },
  "Fenerbahçe":        { mean:  638, median:  550, stdDev: 336 },
  "Shakhtar Donetsk":  { mean:  395, median:  350, stdDev: 213 },
  "AEK Athen":         { mean:  576, median:  500, stdDev: 313 },
  "Feyenoord":         { mean:  466, median:  400, stdDev: 256 },
  "Viking FK":         { mean:  516, median:  450, stdDev: 274 },
  "Slovan Bratislava": { mean:  361, median:  350, stdDev: 193 },
  "LASK Linz":         { mean:  425, median:  400, stdDev: 228 },
  "Sabah FK":          { mean:  270, median:  250, stdDev: 160 },
};

const statsFor = (name: string) => SIM_STATS[name] ?? { mean: 0, median: 0, stdDev: 0 };

const TOTAL_MEAN = RAW.reduce((s, t) => s + statsFor(t.name).mean, 0);
/** Skalering så fairPrice-summen matcher ~4.000 mønter (som VM). */
const FAIR_SCALE = TOTAL_MEAN > 0 ? 4000 / TOTAL_MEAN : 0;

export const CL2627_TEAMS: TournamentTeam[] = RAW.map((t) => {
  const s = statsFor(t.name);
  return {
    name: t.name,
    group: "Liga",
    elo: t.elo,
    mean: s.mean,
    median: s.median,
    stdDev: s.stdDev,
    fairPrice: Math.round(s.mean * FAIR_SCALE * 10) / 10,
    flag: t.flag,
    aliases: t.aliases,
  };
});

/** Case-insensitivt opslag inkl. aliasser. */
export function findCL2627Team(name: string): TournamentTeam | undefined {
  const n = name.trim().toLowerCase();
  return CL2627_TEAMS.find(
    (t) => t.name.toLowerCase() === n || t.aliases.some((a) => a.toLowerCase() === n),
  );
}
