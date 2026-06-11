export type WC2026Team = {
  name: string;
  group: string;
  mostLikely: number;
  p10: number;
  median: number;
  mean: number;
  p90: number;
  stdDev: number;
  fairPrice: number;
  flag: string;
  aliases: string[];
};

export const WC2026_TEAMS: WC2026Team[] = [
  { name: "Spain",          group: "H", mostLikely: 550, p10: 400, median: 850, mean: 1049, p90: 2000, stdDev: 603, fairPrice: 187, flag: "🇪🇸", aliases: ["Spanien"] },
  { name: "England",        group: "L", mostLikely: 550, p10: 350, median: 800, mean: 982,  p90: 1950, stdDev: 579, fairPrice: 175, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["England"] },
  { name: "France",         group: "I", mostLikely: 550, p10: 300, median: 800, mean: 957,  p90: 1950, stdDev: 589, fairPrice: 171, flag: "🇫🇷", aliases: ["Frankrig"] },
  { name: "Argentina",      group: "J", mostLikely: 450, p10: 300, median: 700, mean: 880,  p90: 1800, stdDev: 561, fairPrice: 157, flag: "🇦🇷", aliases: ["Argentina"] },
  { name: "Brazil",         group: "C", mostLikely: 450, p10: 300, median: 700, mean: 874,  p90: 1800, stdDev: 548, fairPrice: 156, flag: "🇧🇷", aliases: ["Brasilien", "Brasil"] },
  { name: "Portugal",       group: "K", mostLikely: 450, p10: 300, median: 650, mean: 833,  p90: 1700, stdDev: 535, fairPrice: 149, flag: "🇵🇹", aliases: ["Portugal"] },
  { name: "Germany",        group: "E", mostLikely: 450, p10: 300, median: 650, mean: 775,  p90: 1550, stdDev: 501, fairPrice: 138, flag: "🇩🇪", aliases: ["Tyskland"] },
  { name: "Belgium",        group: "G", mostLikely: 550, p10: 150, median: 550, mean: 663,  p90: 1300, stdDev: 442, fairPrice: 118, flag: "🇧🇪", aliases: ["Belgien"] },
  { name: "Netherlands",    group: "F", mostLikely: 450, p10: 100, median: 550, mean: 662,  p90: 1400, stdDev: 492, fairPrice: 118, flag: "🇳🇱", aliases: ["Holland", "Nederland"] },
  { name: "Norway",         group: "I", mostLikely: 300, p10: 100, median: 500, mean: 609,  p90: 1300, stdDev: 476, fairPrice: 109, flag: "🇳🇴", aliases: ["Norge"] },
  { name: "Colombia",       group: "K", mostLikely: 300, p10: 100, median: 450, mean: 585,  p90: 1250, stdDev: 440, fairPrice: 105, flag: "🇨🇴", aliases: ["Colombia"] },
  { name: "Mexico",         group: "A", mostLikely: 450, p10: 100, median: 450, mean: 542,  p90: 1050, stdDev: 383, fairPrice: 97,  flag: "🇲🇽", aliases: ["Mexico", "México"] },
  { name: "Turkey",         group: "D", mostLikely: 300, p10: 100, median: 450, mean: 542,  p90: 1100, stdDev: 415, fairPrice: 97,  flag: "🇹🇷", aliases: ["Tyrkiet", "Türkiye", "Türkiy", "Turkiye"] },
  { name: "USA",            group: "D", mostLikely: 300, p10: 50,  median: 450, mean: 520,  p90: 1050, stdDev: 404, fairPrice: 93,  flag: "🇺🇸", aliases: ["United States", "United States of America", "US", "United States of America (USA)"] },
  { name: "Switzerland",    group: "B", mostLikely: 300, p10: 100, median: 450, mean: 520,  p90: 1000, stdDev: 378, fairPrice: 93,  flag: "🇨🇭", aliases: ["Schweiz"] },
  { name: "Japan",          group: "F", mostLikely: 300, p10: 50,  median: 400, mean: 505,  p90: 1100, stdDev: 425, fairPrice: 90,  flag: "🇯🇵", aliases: ["Japan"] },
  { name: "Morocco",        group: "C", mostLikely: 300, p10: 50,  median: 400, mean: 495,  p90: 1050, stdDev: 405, fairPrice: 88,  flag: "🇲🇦", aliases: ["Marokko"] },
  { name: "Uruguay",        group: "H", mostLikely: 300, p10: 50,  median: 400, mean: 481,  p90: 1000, stdDev: 398, fairPrice: 86,  flag: "🇺🇾", aliases: ["Uruguay"] },
  { name: "Czech Rep.",     group: "A", mostLikely: 300, p10: 50,  median: 400, mean: 470,  p90: 950,  stdDev: 356, fairPrice: 84,  flag: "🇨🇿", aliases: ["Czech Republic", "Czechia", "Tjekkiet", "Czech Republic (Czechia)"] },
  { name: "Ecuador",        group: "E", mostLikely: 300, p10: 50,  median: 400, mean: 470,  p90: 950,  stdDev: 374, fairPrice: 84,  flag: "🇪🇨", aliases: ["Ecuador"] },
  { name: "Croatia",        group: "L", mostLikely: 300, p10: 50,  median: 400, mean: 456,  p90: 1000, stdDev: 388, fairPrice: 81,  flag: "🇭🇷", aliases: ["Kroatien"] },
  { name: "Austria",        group: "J", mostLikely: 300, p10: 50,  median: 400, mean: 454,  p90: 1000, stdDev: 384, fairPrice: 81,  flag: "🇦🇹", aliases: ["Østrig"] },
  { name: "Canada",         group: "B", mostLikely: 300, p10: 50,  median: 400, mean: 454,  p90: 900,  stdDev: 351, fairPrice: 81,  flag: "🇨🇦", aliases: ["Canada"] },
  { name: "Sweden",         group: "F", mostLikely: 50,  p10: 50,  median: 350, mean: 444,  p90: 1000, stdDev: 392, fairPrice: 79,  flag: "🇸🇪", aliases: ["Sverige"] },
  { name: "Egypt",          group: "G", mostLikely: 50,  p10: 50,  median: 350, mean: 409,  p90: 850,  stdDev: 336, fairPrice: 73,  flag: "🇪🇬", aliases: ["Egypten"] },
  { name: "Bosnia/Herzeg.", group: "B", mostLikely: 50,  p10: 50,  median: 350, mean: 407,  p90: 850,  stdDev: 331, fairPrice: 73,  flag: "🇧🇦", aliases: ["Bosnia and Herzegovina", "Bosnia-Herzegovina", "Bosnien", "Bosnia & Herzegovina"] },
  { name: "Senegal",        group: "I", mostLikely: 50,  p10: 50,  median: 300, mean: 401,  p90: 900,  stdDev: 380, fairPrice: 72,  flag: "🇸🇳", aliases: ["Senegal"] },
  { name: "Paraguay",       group: "D", mostLikely: 50,  p10: 50,  median: 300, mean: 395,  p90: 900,  stdDev: 345, fairPrice: 71,  flag: "🇵🇾", aliases: ["Paraguay"] },
  { name: "IR Iran",        group: "G", mostLikely: 50,  p10: 50,  median: 300, mean: 373,  p90: 800,  stdDev: 320, fairPrice: 67,  flag: "🇮🇷", aliases: ["Iran", "Islamic Republic of Iran", "Iran (Islamic Republic of)"] },
  { name: "Ivory Coast",    group: "E", mostLikely: 50,  p10: 50,  median: 300, mean: 359,  p90: 750,  stdDev: 322, fairPrice: 64,  flag: "🇨🇮", aliases: ["Côte d'Ivoire", "Cote d'Ivoire", "Elfenbenskysten", "Côte d'Ivoire (Ivory Coast)"] },
  { name: "Rep. of Korea",  group: "A", mostLikely: 50,  p10: 50,  median: 300, mean: 358,  p90: 700,  stdDev: 307, fairPrice: 64,  flag: "🇰🇷", aliases: ["South Korea", "Korea Republic", "Sydkorea", "Korea", "Republic of Korea"] },
  { name: "Scotland",       group: "C", mostLikely: 50,  p10: 50,  median: 300, mean: 346,  p90: 800,  stdDev: 328, fairPrice: 62,  flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", aliases: ["Skotland"] },
  { name: "Algeria",        group: "J", mostLikely: 50,  p10: 50,  median: 300, mean: 322,  p90: 700,  stdDev: 312, fairPrice: 58,  flag: "🇩🇿", aliases: ["Algeriet"] },
  { name: "Ghana",          group: "L", mostLikely: 50,  p10: 50,  median: 250, mean: 306,  p90: 650,  stdDev: 305, fairPrice: 55,  flag: "🇬🇭", aliases: ["Ghana"] },
  { name: "Australia",      group: "D", mostLikely: 50,  p10: 0,   median: 250, mean: 293,  p90: 650,  stdDev: 291, fairPrice: 52,  flag: "🇦🇺", aliases: ["Australien"] },
  { name: "South Africa",   group: "A", mostLikely: 50,  p10: 0,   median: 250, mean: 292,  p90: 650,  stdDev: 274, fairPrice: 52,  flag: "🇿🇦", aliases: ["Sydafrika"] },
  { name: "Qatar",          group: "B", mostLikely: 50,  p10: 0,   median: 250, mean: 286,  p90: 650,  stdDev: 273, fairPrice: 51,  flag: "🇶🇦", aliases: ["Qatar"] },
  { name: "New Zealand",    group: "G", mostLikely: 50,  p10: 0,   median: 200, mean: 280,  p90: 600,  stdDev: 274, fairPrice: 50,  flag: "🇳🇿", aliases: ["New Zealand"] },
  { name: "DR Congo",       group: "K", mostLikely: 50,  p10: 0,   median: 150, mean: 266,  p90: 600,  stdDev: 272, fairPrice: 48,  flag: "🇨🇩", aliases: ["Congo DR", "Democratic Republic of Congo", "Congo", "Democratic Republic of the Congo"] },
  { name: "Tunisia",        group: "F", mostLikely: 50,  p10: 0,   median: 150, mean: 263,  p90: 600,  stdDev: 286, fairPrice: 47,  flag: "🇹🇳", aliases: ["Tunesien"] },
  { name: "Cape Verde",     group: "H", mostLikely: 50,  p10: 0,   median: 150, mean: 260,  p90: 550,  stdDev: 273, fairPrice: 46,  flag: "🇨🇻", aliases: ["Kap Verde", "Cape Verde Islands", "Cabo Verde"] },
  { name: "Panama",         group: "L", mostLikely: 50,  p10: 0,   median: 150, mean: 246,  p90: 550,  stdDev: 268, fairPrice: 44,  flag: "🇵🇦", aliases: ["Panama"] },
  { name: "Jordan",         group: "J", mostLikely: 50,  p10: 0,   median: 150, mean: 232,  p90: 550,  stdDev: 252, fairPrice: 41,  flag: "🇯🇴", aliases: ["Jordan"] },
  { name: "Saudi Arabia",   group: "H", mostLikely: 50,  p10: 0,   median: 150, mean: 228,  p90: 550,  stdDev: 250, fairPrice: 41,  flag: "🇸🇦", aliases: ["Saudi-Arabien"] },
  { name: "Curaçao",        group: "E", mostLikely: 50,  p10: 0,   median: 150, mean: 227,  p90: 550,  stdDev: 247, fairPrice: 41,  flag: "🇨🇼", aliases: ["Curacao"] },
  { name: "Uzbekistan",     group: "K", mostLikely: 50,  p10: 0,   median: 150, mean: 220,  p90: 550,  stdDev: 242, fairPrice: 39,  flag: "🇺🇿", aliases: ["Usbekistan"] },
  { name: "Haiti",          group: "C", mostLikely: 50,  p10: 0,   median: 150, mean: 205,  p90: 500,  stdDev: 237, fairPrice: 37,  flag: "🇭🇹", aliases: ["Haiti"] },
  { name: "Iraq",           group: "I", mostLikely: 50,  p10: 0,   median: 100, mean: 192,  p90: 500,  stdDev: 242, fairPrice: 34,  flag: "🇮🇶", aliases: ["Irak"] },
];

/** Slår et holdnavn op (case-insensitiv + aliasser). */
export function findWC2026Team(name: string): WC2026Team | undefined {
  const n = name.trim().toLowerCase();
  return WC2026_TEAMS.find(
    (t) => t.name.toLowerCase() === n || t.aliases.some((a) => a.toLowerCase() === n),
  );
}

/** Box-Muller normalfordeling N(0,1). */
function normalRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export type PlayerSim = {
  playerId: string;
  teams: { mean: number; stdDev: number }[];
};

/** Kører N simuleringer og returnerer vindersandsynlighed pr. spiller (0-1). */
export function simulateWinProbabilities(
  players: PlayerSim[],
  N = 8000,
): Record<string, number> {
  const wins: Record<string, number> = {};
  for (const p of players) wins[p.playerId] = 0;

  for (let i = 0; i < N; i++) {
    let bestScore = -1;
    let bestId = "";
    for (const p of players) {
      let score = 0;
      for (const t of p.teams) {
        score += Math.max(0, t.mean + t.stdDev * normalRandom());
      }
      if (score > bestScore) { bestScore = score; bestId = p.playerId; }
    }
    if (bestId) wins[bestId]++;
  }

  return Object.fromEntries(Object.entries(wins).map(([k, v]) => [k, v / N]));
}
