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
  { name: "Spain",          group: "H", mostLikely: 800,  p10: 550, median: 1400, mean: 1352.5, p90: 2150, stdDev: 572.7, fairPrice: 239.2, flag: "🇪🇸", aliases: ["Spanien"] },
  { name: "England",        group: "L", mostLikely: 1150, p10: 550, median: 1150, mean: 1239.9, p90: 2050, stdDev: 534.1, fairPrice: 219.3, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["England"] },
  { name: "France",         group: "I", mostLikely: 800,  p10: 550, median: 1150, mean: 1210.8, p90: 2050, stdDev: 565.6, fairPrice: 214.2, flag: "🇫🇷", aliases: ["Frankrig"] },
  { name: "Portugal",       group: "K", mostLikely: 1150, p10: 550, median: 1150, mean: 1198.9, p90: 2000, stdDev: 525.3, fairPrice: 212.1, flag: "🇵🇹", aliases: ["Portugal"] },
  { name: "Argentina",      group: "J", mostLikely: 550,  p10: 450, median: 1100, mean: 1114.4, p90: 1900, stdDev: 535.1, fairPrice: 197.1, flag: "🇦🇷", aliases: ["Argentina"] },
  { name: "Brazil",         group: "C", mostLikely: 550,  p10: 450, median: 950,  mean: 1029.8, p90: 1850, stdDev: 507.2, fairPrice: 182.2, flag: "🇧🇷", aliases: ["Brasilien", "Brasil"] },
  { name: "Germany",        group: "E", mostLikely: 800,  p10: 450, median: 800,  mean: 930.0,  p90: 1650, stdDev: 457.9, fairPrice: 164.5, flag: "🇩🇪", aliases: ["Tyskland"] },
  { name: "Belgium",        group: "G", mostLikely: 1150, p10: 450, median: 800,  mean: 884.1,  p90: 1400, stdDev: 393.8, fairPrice: 156.4, flag: "🇧🇪", aliases: ["Belgien"] },
  { name: "Netherlands",    group: "F", mostLikely: 450,  p10: 300, median: 600,  mean: 764.6,  p90: 1450, stdDev: 458.5, fairPrice: 135.2, flag: "🇳🇱", aliases: ["Holland", "Nederland"] },
  { name: "Colombia",       group: "K", mostLikely: 650,  p10: 300, median: 600,  mean: 679.6,  p90: 1250, stdDev: 377.2, fairPrice: 120.2, flag: "🇨🇴", aliases: ["Colombia"] },
  { name: "USA",            group: "D", mostLikely: 550,  p10: 250, median: 600,  mean: 678.0,  p90: 1150, stdDev: 370.6, fairPrice: 119.9, flag: "🇺🇸", aliases: ["United States", "United States of America", "US", "United States of America (USA)"] },
  { name: "Switzerland",    group: "B", mostLikely: 700,  p10: 300, median: 650,  mean: 666.0,  p90: 1050, stdDev: 321.3, fairPrice: 117.8, flag: "🇨🇭", aliases: ["Schweiz"] },
  { name: "Mexico",         group: "A", mostLikely: 700,  p10: 300, median: 650,  mean: 658.6,  p90: 1050, stdDev: 308.9, fairPrice: 116.5, flag: "🇲🇽", aliases: ["Mexico", "México"] },
  { name: "Morocco",        group: "C", mostLikely: 400,  p10: 300, median: 550,  mean: 652.1,  p90: 1150, stdDev: 367.5, fairPrice: 115.3, flag: "🇲🇦", aliases: ["Marokko"] },
  { name: "Norway",         group: "I", mostLikely: 300,  p10: 250, median: 550,  mean: 609.7,  p90: 1150, stdDev: 388.8, fairPrice: 107.8, flag: "🇳🇴", aliases: ["Norge"] },
  { name: "Turkey",         group: "D", mostLikely: 550,  p10: 150, median: 550,  mean: 602.7,  p90: 1050, stdDev: 348.6, fairPrice: 106.6, flag: "🇹🇷", aliases: ["Tyrkiet", "Türkiye", "Türkiy", "Turkiye"] },
  { name: "Uruguay",        group: "H", mostLikely: 400,  p10: 300, median: 400,  mean: 524.9,  p90: 1000, stdDev: 314.0, fairPrice: 92.8,  flag: "🇺🇾", aliases: ["Uruguay"] },
  { name: "Ecuador",        group: "E", mostLikely: 400,  p10: 250, median: 450,  mean: 504.5,  p90: 850,  stdDev: 276.0, fairPrice: 89.2,  flag: "🇪🇨", aliases: ["Ecuador"] },
  { name: "Japan",          group: "F", mostLikely: 300,  p10: 100, median: 400,  mean: 497.9,  p90: 1000, stdDev: 342.7, fairPrice: 88.1,  flag: "🇯🇵", aliases: ["Japan"] },
  { name: "Croatia",        group: "L", mostLikely: 400,  p10: 250, median: 400,  mean: 490.8,  p90: 850,  stdDev: 294.1, fairPrice: 86.8,  flag: "🇭🇷", aliases: ["Kroatien"] },
  { name: "Canada",         group: "B", mostLikely: 300,  p10: 100, median: 450,  mean: 484.5,  p90: 850,  stdDev: 286.2, fairPrice: 85.7,  flag: "🇨🇦", aliases: ["Canada"] },
  { name: "Senegal",        group: "I", mostLikely: 300,  p10: 50,  median: 350,  mean: 433.2,  p90: 850,  stdDev: 319.0, fairPrice: 76.6,  flag: "🇸🇳", aliases: ["Senegal"] },
  { name: "Egypt",          group: "G", mostLikely: 300,  p10: 50,  median: 400,  mean: 387.4,  p90: 650,  stdDev: 249.9, fairPrice: 68.5,  flag: "🇪🇬", aliases: ["Egypten"] },
  { name: "Rep. of Korea",  group: "A", mostLikely: 300,  p10: 50,  median: 350,  mean: 384.0,  p90: 700,  stdDev: 254.9, fairPrice: 67.9,  flag: "🇰🇷", aliases: ["South Korea", "Korea Republic", "Sydkorea", "Korea", "Republic of Korea"] },
  { name: "Czech Rep.",     group: "A", mostLikely: 300,  p10: 50,  median: 350,  mean: 383.6,  p90: 700,  stdDev: 254.2, fairPrice: 67.9,  flag: "🇨🇿", aliases: ["Czech Republic", "Czechia", "Tjekkiet", "Czech Republic (Czechia)"] },
  { name: "Bosnia/Herzeg.", group: "B", mostLikely: 300,  p10: 50,  median: 350,  mean: 374.4,  p90: 700,  stdDev: 261.7, fairPrice: 66.2,  flag: "🇧🇦", aliases: ["Bosnia and Herzegovina", "Bosnia-Herzegovina", "Bosnien", "Bosnia & Herzegovina"] },
  { name: "Austria",        group: "J", mostLikely: 400,  p10: 50,  median: 350,  mean: 356.4,  p90: 600,  stdDev: 232.0, fairPrice: 63.0,  flag: "🇦🇹", aliases: ["Østrig"] },
  { name: "Ivory Coast",    group: "E", mostLikely: 300,  p10: 50,  median: 300,  mean: 349.0,  p90: 600,  stdDev: 225.7, fairPrice: 61.7,  flag: "🇨🇮", aliases: ["Côte d'Ivoire", "Cote d'Ivoire", "Elfenbenskysten", "Côte d'Ivoire (Ivory Coast)"] },
  { name: "Sweden",         group: "F", mostLikely: 300,  p10: 50,  median: 300,  mean: 341.8,  p90: 650,  stdDev: 261.7, fairPrice: 60.5,  flag: "🇸🇪", aliases: ["Sverige"] },
  { name: "Scotland",       group: "C", mostLikely: 250,  p10: 50,  median: 250,  mean: 286.9,  p90: 500,  stdDev: 207.4, fairPrice: 50.7,  flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", aliases: ["Skotland"] },
  { name: "Paraguay",       group: "D", mostLikely: 50,   p10: 50,  median: 250,  mean: 283.4,  p90: 600,  stdDev: 243.1, fairPrice: 50.1,  flag: "🇵🇾", aliases: ["Paraguay"] },
  { name: "Algeria",        group: "J", mostLikely: 300,  p10: 50,  median: 300,  mean: 280.7,  p90: 500,  stdDev: 206.2, fairPrice: 49.7,  flag: "🇩🇿", aliases: ["Algeriet"] },
  { name: "IR Iran",        group: "G", mostLikely: 50,   p10: 50,  median: 250,  mean: 262.9,  p90: 550,  stdDev: 211.7, fairPrice: 46.5,  flag: "🇮🇷", aliases: ["Iran", "Islamic Republic of Iran", "Iran (Islamic Republic of)"] },
  { name: "Ghana",          group: "L", mostLikely: 50,   p10: 0,   median: 150,  mean: 182.8,  p90: 400,  stdDev: 164.7, fairPrice: 32.3,  flag: "🇬🇭", aliases: ["Ghana"] },
  { name: "Australia",      group: "D", mostLikely: 50,   p10: 0,   median: 100,  mean: 166.9,  p90: 400,  stdDev: 185.4, fairPrice: 29.5,  flag: "🇦🇺", aliases: ["Australien"] },
  { name: "New Zealand",    group: "G", mostLikely: 50,   p10: 0,   median: 100,  mean: 159.1,  p90: 400,  stdDev: 169.0, fairPrice: 28.1,  flag: "🇳🇿", aliases: ["New Zealand"] },
  { name: "South Africa",   group: "A", mostLikely: 50,   p10: 0,   median: 50,   mean: 148.1,  p90: 400,  stdDev: 169.4, fairPrice: 26.2,  flag: "🇿🇦", aliases: ["Sydafrika"] },
  { name: "Qatar",          group: "B", mostLikely: 0,    p10: 0,   median: 50,   mean: 134.1,  p90: 350,  stdDev: 164.0, fairPrice: 23.7,  flag: "🇶🇦", aliases: ["Qatar"] },
  { name: "DR Congo",       group: "K", mostLikely: 50,   p10: 0,   median: 100,  mean: 133.5,  p90: 300,  stdDev: 138.3, fairPrice: 23.6,  flag: "🇨🇩", aliases: ["Congo DR", "Democratic Republic of Congo", "Congo", "Democratic Republic of the Congo"] },
  { name: "Cape Verde",     group: "H", mostLikely: 0,    p10: 0,   median: 50,   mean: 124.5,  p90: 300,  stdDev: 136.4, fairPrice: 22.0,  flag: "🇨🇻", aliases: ["Kap Verde", "Cape Verde Islands", "Cabo Verde"] },
  { name: "Saudi Arabia",   group: "H", mostLikely: 0,    p10: 0,   median: 50,   mean: 124.1,  p90: 300,  stdDev: 136.6, fairPrice: 22.0,  flag: "🇸🇦", aliases: ["Saudi-Arabien"] },
  { name: "Uzbekistan",     group: "K", mostLikely: 0,    p10: 0,   median: 50,   mean: 107.0,  p90: 300,  stdDev: 123.5, fairPrice: 18.9,  flag: "🇺🇿", aliases: ["Usbekistan"] },
  { name: "Panama",         group: "L", mostLikely: 0,    p10: 0,   median: 50,   mean: 104.1,  p90: 300,  stdDev: 126.3, fairPrice: 18.4,  flag: "🇵🇦", aliases: ["Panama"] },
  { name: "Tunisia",        group: "F", mostLikely: 0,    p10: 0,   median: 50,   mean: 103.3,  p90: 300,  stdDev: 134.4, fairPrice: 18.3,  flag: "🇹🇳", aliases: ["Tunesien"] },
  { name: "Jordan",         group: "J", mostLikely: 0,    p10: 0,   median: 50,   mean: 101.9,  p90: 300,  stdDev: 129.1, fairPrice: 18.0,  flag: "🇯🇴", aliases: ["Jordan"] },
  { name: "Curaçao",        group: "E", mostLikely: 0,    p10: 0,   median: 0,    mean: 44.1,   p90: 150,  stdDev: 81.0,  fairPrice: 7.8,   flag: "🇨🇼", aliases: ["Curacao"] },
  { name: "Iraq",           group: "I", mostLikely: 0,    p10: 0,   median: 0,    mean: 42.5,   p90: 150,  stdDev: 81.8,  fairPrice: 7.5,   flag: "🇮🇶", aliases: ["Irak"] },
  { name: "Haiti",          group: "C", mostLikely: 0,    p10: 0,   median: 0,    mean: 39.6,   p90: 150,  stdDev: 74.3,  fairPrice: 7.0,   flag: "🇭🇹", aliases: ["Haiti"] },
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
