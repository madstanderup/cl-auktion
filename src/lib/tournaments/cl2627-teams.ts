import type { TournamentTeam } from "./types";

/**
 * CL 26/27 — de 36 hold i ligafasen med Elo-rating (pr. 27. august 2026).
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
  { name: "Bayern München",     elo: 2085, flag: "🇩🇪", aliases: ["Bayern Munich", "FC Bayern", "Bayern", "FC Bayern München"] },
  { name: "Arsenal",            elo: 2055, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Arsenal FC"] },
  { name: "PSG",                elo: 2026, flag: "🇫🇷", aliases: ["Paris Saint-Germain", "Paris SG", "Paris"] },
  { name: "Barcelona",          elo: 1970, flag: "🇪🇸", aliases: ["FC Barcelona", "Barca", "Barça"] },
  { name: "Real Madrid",        elo: 1934, flag: "🇪🇸", aliases: ["Real Madrid CF"] },
  { name: "Manchester City",    elo: 1923, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Man City", "Manchester City FC"] },
  { name: "Inter",              elo: 1916, flag: "🇮🇹", aliases: ["Inter Milan", "Internazionale", "FC Internazionale"] },
  { name: "Manchester United",  elo: 1895, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Man United", "Man Utd", "Manchester Utd", "Manchester United FC"] },
  { name: "Aston Villa",        elo: 1883, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Aston Villa FC", "Villa"] },
  { name: "Borussia Dortmund",  elo: 1859, flag: "🇩🇪", aliases: ["Dortmund", "BVB"] },
  { name: "Sporting CP",        elo: 1843, flag: "🇵🇹", aliases: ["Sporting", "Sporting Lissabon", "Sporting Lisbon"] },
  { name: "AS Roma",            elo: 1832, flag: "🇮🇹", aliases: ["Roma", "Rom"] },
  { name: "Como",               elo: 1819, flag: "🇮🇹", aliases: ["Como 1907", "Como FC"] },
  { name: "Liverpool",          elo: 1817, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Liverpool FC"] },
  { name: "PSV",                elo: 1807, flag: "🇳🇱", aliases: ["PSV Eindhoven"] },
  { name: "Atlético Madrid",    elo: 1800, flag: "🇪🇸", aliases: ["Atletico Madrid", "Atlético", "Atletico"] },
  { name: "FC Porto",           elo: 1797, flag: "🇵🇹", aliases: ["Porto"] },
  { name: "Napoli",             elo: 1788, flag: "🇮🇹", aliases: ["SSC Napoli"] },
  { name: "VfB Stuttgart",      elo: 1784, flag: "🇩🇪", aliases: ["Stuttgart"] },
  { name: "Club Brugge",        elo: 1768, flag: "🇧🇪", aliases: ["Club Bruges", "Brugge"] },
  { name: "RB Leipzig",         elo: 1763, flag: "🇩🇪", aliases: ["Leipzig", "RasenBallsport Leipzig"] },
  { name: "Bodø/Glimt",         elo: 1748, flag: "🇳🇴", aliases: ["Bodo/Glimt", "Bodø Glimt", "Bodo Glimt", "FK Bodø/Glimt"] },
  { name: "RC Lens",            elo: 1745, flag: "🇫🇷", aliases: ["Lens"] },
  { name: "Real Betis",         elo: 1742, flag: "🇪🇸", aliases: ["Betis", "Real Betis Balompié"] },
  { name: "Villarreal",         elo: 1738, flag: "🇪🇸", aliases: ["Villarreal CF"] },
  { name: "Galatasaray",        elo: 1735, flag: "🇹🇷", aliases: ["Galatasaray SK"] },
  { name: "Lille",              elo: 1711, flag: "🇫🇷", aliases: ["LOSC", "LOSC Lille"] },
  { name: "Slavia Praha",       elo: 1704, flag: "🇨🇿", aliases: ["Slavia Prague", "Slavia Prag", "SK Slavia Praha"] },
  { name: "Fenerbahçe",         elo: 1699, flag: "🇹🇷", aliases: ["Fenerbahce", "Fenerbahçe SK"] },
  { name: "Shakhtar Donetsk",   elo: 1679, flag: "🇺🇦", aliases: ["Shakhtar", "FC Shakhtar Donetsk"] },
  { name: "AEK Athen",          elo: 1673, flag: "🇬🇷", aliases: ["AEK Athens", "AEK", "AEK Athina"] },
  { name: "Feyenoord",          elo: 1657, flag: "🇳🇱", aliases: ["Feyenoord Rotterdam"] },
  { name: "Viking FK",          elo: 1574, flag: "🇳🇴", aliases: ["Viking", "Viking Stavanger"] },
  { name: "Slovan Bratislava",  elo: 1560, flag: "🇸🇰", aliases: ["Slovan", "ŠK Slovan Bratislava"] },
  { name: "LASK Linz",          elo: 1527, flag: "🇦🇹", aliases: ["LASK", "LASK Linz FC"] },
  { name: "Sabah FK",           elo: 1424, flag: "🇦🇿", aliases: ["Sabah", "Sabah Baku"] },
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
  "Bayern München":    { mean: 1776, median: 1800, stdDev: 629 },
  "Arsenal":           { mean: 1633, median: 1600, stdDev: 628 },
  "PSG":               { mean: 1490, median: 1400, stdDev: 628 },
  "Barcelona":         { mean: 1276, median: 1200, stdDev: 585 },
  "Real Madrid":       { mean: 1164, median: 1050, stdDev: 551 },
  "Manchester City":   { mean: 1041, median:  950, stdDev: 539 },
  "Inter":             { mean: 1151, median: 1050, stdDev: 532 },
  "Manchester United": { mean: 1003, median:  900, stdDev: 506 },
  "Aston Villa":       { mean:  967, median:  850, stdDev: 493 },
  "Borussia Dortmund": { mean:  916, median:  800, stdDev: 463 },
  "Sporting CP":       { mean:  843, median:  750, stdDev: 443 },
  "AS Roma":           { mean:  806, median:  700, stdDev: 426 },
  "Como":              { mean:  742, median:  650, stdDev: 405 },
  "Liverpool":         { mean:  844, median:  750, stdDev: 424 },
  "PSV":               { mean:  793, median:  700, stdDev: 408 },
  "Atlético Madrid":   { mean:  710, median:  650, stdDev: 385 },
  "FC Porto":          { mean:  795, median:  700, stdDev: 401 },
  "Napoli":            { mean:  754, median:  650, stdDev: 379 },
  "VfB Stuttgart":     { mean:  781, median:  700, stdDev: 386 },
  "Club Brugge":       { mean:  609, median:  550, stdDev: 343 },
  "RB Leipzig":        { mean:  608, median:  550, stdDev: 338 },
  "Bodø/Glimt":        { mean:  615, median:  550, stdDev: 326 },
  "RC Lens":           { mean:  580, median:  500, stdDev: 320 },
  "Real Betis":        { mean:  559, median:  500, stdDev: 305 },
  "Villarreal":        { mean:  603, median:  550, stdDev: 316 },
  "Galatasaray":       { mean:  536, median:  450, stdDev: 296 },
  "Lille":             { mean:  505, median:  450, stdDev: 273 },
  "Slavia Praha":      { mean:  512, median:  450, stdDev: 268 },
  "Fenerbahçe":        { mean:  570, median:  500, stdDev: 292 },
  "Shakhtar Donetsk":  { mean:  500, median:  450, stdDev: 262 },
  "AEK Athen":         { mean:  473, median:  400, stdDev: 250 },
  "Feyenoord":         { mean:  447, median:  400, stdDev: 238 },
  "Viking FK":         { mean:  369, median:  350, stdDev: 189 },
  "Slovan Bratislava": { mean:  350, median:  350, stdDev: 185 },
  "LASK Linz":         { mean:  328, median:  300, stdDev: 178 },
  "Sabah FK":          { mean:  209, median:  200, stdDev: 136 },
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
