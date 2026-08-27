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
 * (tom turnering, 200.000 iterationer af alle 8 ligarunder + knockout).
 * Genkør scriptet og indsæt outputtet, når RAW ovenfor ændres.
 */
const SIM_STATS: Record<string, { mean: number; median: number; stdDev: number }> = {
  "Bayern München":    { mean: 1775, median: 1800, stdDev: 635 },
  "Arsenal":           { mean: 1650, median: 1600, stdDev: 631 },
  "PSG":               { mean: 1527, median: 1450, stdDev: 622 },
  "Barcelona":         { mean: 1299, median: 1200, stdDev: 589 },
  "Real Madrid":       { mean: 1159, median: 1050, stdDev: 554 },
  "Manchester City":   { mean: 1120, median: 1050, stdDev: 544 },
  "Inter":             { mean: 1095, median: 1000, stdDev: 537 },
  "Manchester United": { mean: 1020, median:  950, stdDev: 513 },
  "Aston Villa":       { mean:  979, median:  900, stdDev: 498 },
  "Borussia Dortmund": { mean:  900, median:  800, stdDev: 468 },
  "Sporting CP":       { mean:  849, median:  750, stdDev: 448 },
  "AS Roma":           { mean:  819, median:  700, stdDev: 434 },
  "Como":              { mean:  784, median:  700, stdDev: 418 },
  "Liverpool":         { mean:  779, median:  700, stdDev: 416 },
  "PSV":               { mean:  749, median:  650, stdDev: 403 },
  "Atlético Madrid":   { mean:  732, median:  650, stdDev: 395 },
  "FC Porto":          { mean:  725, median:  650, stdDev: 391 },
  "Napoli":            { mean:  702, median:  650, stdDev: 380 },
  "VfB Stuttgart":     { mean:  693, median:  600, stdDev: 375 },
  "Club Brugge":       { mean:  655, median:  600, stdDev: 355 },
  "RB Leipzig":        { mean:  642, median:  550, stdDev: 347 },
  "Bodø/Glimt":        { mean:  612, median:  550, stdDev: 333 },
  "RC Lens":           { mean:  605, median:  550, stdDev: 329 },
  "Real Betis":        { mean:  599, median:  550, stdDev: 327 },
  "Villarreal":        { mean:  592, median:  500, stdDev: 323 },
  "Galatasaray":       { mean:  584, median:  500, stdDev: 317 },
  "Lille":             { mean:  540, median:  500, stdDev: 294 },
  "Slavia Praha":      { mean:  527, median:  450, stdDev: 286 },
  "Fenerbahçe":        { mean:  520, median:  450, stdDev: 283 },
  "Shakhtar Donetsk":  { mean:  486, median:  450, stdDev: 263 },
  "AEK Athen":         { mean:  477, median:  450, stdDev: 259 },
  "Feyenoord":         { mean:  453, median:  400, stdDev: 245 },
  "Viking FK":         { mean:  350, median:  350, stdDev: 194 },
  "Slovan Bratislava": { mean:  336, median:  300, stdDev: 187 },
  "LASK Linz":         { mean:  303, median:  300, stdDev: 174 },
  "Sabah FK":          { mean:  222, median:  200, stdDev: 144 },
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
