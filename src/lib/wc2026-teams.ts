export type WC2026Team = {
  name: string;
  group: string;
  mostLikely: number;
  p10: number;
  median: number;
  mean: number;
  p90: number;
  aliases: string[];
};

export const WC2026_TEAMS: WC2026Team[] = [
  { name: "Spain",           group: "H", mostLikely: 550, p10: 400, median: 850, mean: 1049, p90: 2000, aliases: ["Spanien"] },
  { name: "England",         group: "L", mostLikely: 550, p10: 350, median: 800, mean: 982,  p90: 1950, aliases: ["England"] },
  { name: "France",          group: "I", mostLikely: 550, p10: 300, median: 800, mean: 957,  p90: 1950, aliases: ["Frankrig"] },
  { name: "Argentina",       group: "J", mostLikely: 450, p10: 300, median: 700, mean: 880,  p90: 1800, aliases: ["Argentina"] },
  { name: "Brazil",          group: "C", mostLikely: 450, p10: 300, median: 700, mean: 874,  p90: 1800, aliases: ["Brasilien", "Brasil"] },
  { name: "Portugal",        group: "K", mostLikely: 450, p10: 300, median: 650, mean: 833,  p90: 1700, aliases: ["Portugal"] },
  { name: "Germany",         group: "E", mostLikely: 450, p10: 300, median: 650, mean: 775,  p90: 1550, aliases: ["Tyskland"] },
  { name: "Belgium",         group: "G", mostLikely: 550, p10: 150, median: 550, mean: 663,  p90: 1300, aliases: ["Belgien"] },
  { name: "Netherlands",     group: "F", mostLikely: 450, p10: 100, median: 550, mean: 662,  p90: 1400, aliases: ["Holland", "Nederland"] },
  { name: "Norway",          group: "I", mostLikely: 300, p10: 100, median: 500, mean: 609,  p90: 1300, aliases: ["Norge"] },
  { name: "Colombia",        group: "K", mostLikely: 300, p10: 100, median: 450, mean: 585,  p90: 1250, aliases: ["Colombia"] },
  { name: "Mexico",          group: "A", mostLikely: 450, p10: 100, median: 450, mean: 542,  p90: 1050, aliases: ["Mexico", "México"] },
  { name: "Turkey",          group: "D", mostLikely: 300, p10: 100, median: 450, mean: 542,  p90: 1100, aliases: ["Tyrkiet", "Türkiye"] },
  { name: "USA",             group: "D", mostLikely: 300, p10: 50,  median: 450, mean: 520,  p90: 1050, aliases: ["United States", "United States of America", "US"] },
  { name: "Switzerland",     group: "B", mostLikely: 300, p10: 100, median: 450, mean: 520,  p90: 1000, aliases: ["Schweiz"] },
  { name: "Japan",           group: "F", mostLikely: 300, p10: 50,  median: 400, mean: 505,  p90: 1100, aliases: ["Japan"] },
  { name: "Morocco",         group: "C", mostLikely: 300, p10: 50,  median: 400, mean: 495,  p90: 1050, aliases: ["Marokko"] },
  { name: "Uruguay",         group: "H", mostLikely: 300, p10: 50,  median: 400, mean: 481,  p90: 1000, aliases: ["Uruguay"] },
  { name: "Czech Rep.",      group: "A", mostLikely: 300, p10: 50,  median: 400, mean: 470,  p90: 950,  aliases: ["Czech Republic", "Czechia", "Tjekkiet"] },
  { name: "Ecuador",         group: "E", mostLikely: 300, p10: 50,  median: 400, mean: 470,  p90: 950,  aliases: ["Ecuador"] },
  { name: "Croatia",         group: "L", mostLikely: 300, p10: 50,  median: 400, mean: 456,  p90: 1000, aliases: ["Kroatien"] },
  { name: "Austria",         group: "J", mostLikely: 300, p10: 50,  median: 400, mean: 454,  p90: 1000, aliases: ["Østrig"] },
  { name: "Canada",          group: "B", mostLikely: 300, p10: 50,  median: 400, mean: 454,  p90: 900,  aliases: ["Canada"] },
  { name: "Sweden",          group: "F", mostLikely: 50,  p10: 50,  median: 350, mean: 444,  p90: 1000, aliases: ["Sverige"] },
  { name: "Egypt",           group: "G", mostLikely: 50,  p10: 50,  median: 350, mean: 409,  p90: 850,  aliases: ["Egypten"] },
  { name: "Bosnia/Herzeg.",  group: "B", mostLikely: 50,  p10: 50,  median: 350, mean: 407,  p90: 850,  aliases: ["Bosnia and Herzegovina", "Bosnia-Herzegovina", "Bosnien", "Bosnia & Herzegovina"] },
  { name: "Senegal",         group: "I", mostLikely: 50,  p10: 50,  median: 300, mean: 401,  p90: 900,  aliases: ["Senegal"] },
  { name: "Paraguay",        group: "D", mostLikely: 50,  p10: 50,  median: 300, mean: 395,  p90: 900,  aliases: ["Paraguay"] },
  { name: "IR Iran",         group: "G", mostLikely: 50,  p10: 50,  median: 300, mean: 373,  p90: 800,  aliases: ["Iran", "Islamic Republic of Iran"] },
  { name: "Ivory Coast",     group: "E", mostLikely: 50,  p10: 50,  median: 300, mean: 359,  p90: 750,  aliases: ["Côte d'Ivoire", "Cote d'Ivoire", "Elfenbenskysten"] },
  { name: "Rep. of Korea",   group: "A", mostLikely: 50,  p10: 50,  median: 300, mean: 358,  p90: 700,  aliases: ["South Korea", "Korea Republic", "Sydkorea", "Korea"] },
  { name: "Scotland",        group: "C", mostLikely: 50,  p10: 50,  median: 300, mean: 346,  p90: 800,  aliases: ["Skotland"] },
  { name: "Algeria",         group: "J", mostLikely: 50,  p10: 50,  median: 300, mean: 322,  p90: 700,  aliases: ["Algeriet"] },
  { name: "Ghana",           group: "L", mostLikely: 50,  p10: 50,  median: 250, mean: 306,  p90: 650,  aliases: ["Ghana"] },
  { name: "Australia",       group: "D", mostLikely: 50,  p10: 0,   median: 250, mean: 293,  p90: 650,  aliases: ["Australien"] },
  { name: "South Africa",    group: "A", mostLikely: 50,  p10: 0,   median: 250, mean: 292,  p90: 650,  aliases: ["Sydafrika"] },
  { name: "Qatar",           group: "B", mostLikely: 50,  p10: 0,   median: 250, mean: 286,  p90: 650,  aliases: ["Qatar"] },
  { name: "New Zealand",     group: "G", mostLikely: 50,  p10: 0,   median: 200, mean: 280,  p90: 600,  aliases: ["New Zealand", "New Zealand"] },
  { name: "DR Congo",        group: "K", mostLikely: 50,  p10: 0,   median: 150, mean: 266,  p90: 600,  aliases: ["Congo DR", "Democratic Republic of Congo", "Congo"] },
  { name: "Tunisia",         group: "F", mostLikely: 50,  p10: 0,   median: 150, mean: 263,  p90: 600,  aliases: ["Tunesien"] },
  { name: "Cape Verde",      group: "H", mostLikely: 50,  p10: 0,   median: 150, mean: 260,  p90: 550,  aliases: ["Kap Verde", "Cape Verde Islands"] },
  { name: "Panama",          group: "L", mostLikely: 50,  p10: 0,   median: 150, mean: 246,  p90: 550,  aliases: ["Panama"] },
  { name: "Jordan",          group: "J", mostLikely: 50,  p10: 0,   median: 150, mean: 232,  p90: 550,  aliases: ["Jordan"] },
  { name: "Saudi Arabia",    group: "H", mostLikely: 50,  p10: 0,   median: 150, mean: 228,  p90: 550,  aliases: ["Saudi-Arabien", "Saudi Arabia"] },
  { name: "Curaçao",         group: "E", mostLikely: 50,  p10: 0,   median: 150, mean: 227,  p90: 550,  aliases: ["Curacao", "Curaçao"] },
  { name: "Uzbekistan",      group: "K", mostLikely: 50,  p10: 0,   median: 150, mean: 220,  p90: 550,  aliases: ["Usbekistan"] },
  { name: "Haiti",           group: "C", mostLikely: 50,  p10: 0,   median: 150, mean: 205,  p90: 500,  aliases: ["Haiti"] },
  { name: "Iraq",            group: "I", mostLikely: 50,  p10: 0,   median: 100, mean: 192,  p90: 500,  aliases: ["Irak"] },
];

/** Slår et holdnavn op i WC2026-data (case-insensitiv, inkl. aliasser). */
export function findWC2026Team(name: string): WC2026Team | undefined {
  const n = name.trim().toLowerCase();
  return WC2026_TEAMS.find(
    (t) =>
      t.name.toLowerCase() === n ||
      t.aliases.some((a) => a.toLowerCase() === n),
  );
}
