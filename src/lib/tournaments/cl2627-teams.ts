import type { TournamentTeam } from "./types";

/**
 * CL 26/27 holdliste — DUMMY baseret på 25/26-deltagerne, indtil
 * kvalifikationen er afgjort (august 2026). mean/stdDev/fairPrice er
 * foreløbige skøn i CL-pointskala (vinder ender typisk på ~2.000-2.400).
 * group er "Liga" for alle — CL har én samlet ligafase.
 */
const RAW: { name: string; mean: number; flag: string; aliases: string[] }[] = [
  { name: "Real Madrid",        mean: 900, flag: "🇪🇸", aliases: ["Real Madrid CF"] },
  { name: "Liverpool",          mean: 850, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Liverpool FC"] },
  { name: "PSG",                mean: 850, flag: "🇫🇷", aliases: ["Paris Saint-Germain", "Paris SG", "Paris"] },
  { name: "Barcelona",          mean: 830, flag: "🇪🇸", aliases: ["FC Barcelona", "Barca", "Barça"] },
  { name: "Bayern München",     mean: 820, flag: "🇩🇪", aliases: ["Bayern Munich", "FC Bayern", "Bayern"] },
  { name: "Manchester City",    mean: 800, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Man City", "Manchester City FC"] },
  { name: "Arsenal",            mean: 780, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Arsenal FC"] },
  { name: "Inter",              mean: 700, flag: "🇮🇹", aliases: ["Inter Milan", "Internazionale", "FC Internazionale"] },
  { name: "Chelsea",            mean: 600, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Chelsea FC"] },
  { name: "Atlético Madrid",    mean: 590, flag: "🇪🇸", aliases: ["Atletico Madrid", "Atlético", "Atletico"] },
  { name: "Bayer Leverkusen",   mean: 560, flag: "🇩🇪", aliases: ["Leverkusen"] },
  { name: "Borussia Dortmund",  mean: 540, flag: "🇩🇪", aliases: ["Dortmund", "BVB"] },
  { name: "Juventus",           mean: 520, flag: "🇮🇹", aliases: ["Juventus FC", "Juve"] },
  { name: "Napoli",             mean: 500, flag: "🇮🇹", aliases: ["SSC Napoli"] },
  { name: "Newcastle",          mean: 490, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Newcastle United", "Newcastle Utd"] },
  { name: "Atalanta",           mean: 480, flag: "🇮🇹", aliases: ["Atalanta BC"] },
  { name: "Benfica",            mean: 470, flag: "🇵🇹", aliases: ["SL Benfica"] },
  { name: "Sporting CP",        mean: 460, flag: "🇵🇹", aliases: ["Sporting", "Sporting Lissabon", "Sporting Lisbon"] },
  { name: "Tottenham",          mean: 430, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", aliases: ["Tottenham Hotspur", "Spurs"] },
  { name: "PSV",                mean: 400, flag: "🇳🇱", aliases: ["PSV Eindhoven"] },
  { name: "Villarreal",         mean: 400, flag: "🇪🇸", aliases: ["Villarreal CF"] },
  { name: "Athletic Club",      mean: 390, flag: "🇪🇸", aliases: ["Athletic Bilbao", "Athletic"] },
  { name: "Ajax",               mean: 380, flag: "🇳🇱", aliases: ["AFC Ajax"] },
  { name: "Eintracht Frankfurt",mean: 380, flag: "🇩🇪", aliases: ["Frankfurt", "Eintracht"] },
  { name: "Monaco",             mean: 380, flag: "🇫🇷", aliases: ["AS Monaco"] },
  { name: "Marseille",          mean: 370, flag: "🇫🇷", aliases: ["Olympique Marseille", "OM", "Olympique de Marseille"] },
  { name: "Galatasaray",        mean: 340, flag: "🇹🇷", aliases: ["Galatasaray SK"] },
  { name: "Club Brugge",        mean: 330, flag: "🇧🇪", aliases: ["Club Bruges", "Brugge"] },
  { name: "Olympiacos",         mean: 300, flag: "🇬🇷", aliases: ["Olympiakos", "Olympiacos FC"] },
  { name: "Bodø/Glimt",         mean: 260, flag: "🇳🇴", aliases: ["Bodo/Glimt", "Bodø Glimt", "Bodo Glimt", "FK Bodø/Glimt"] },
  { name: "Union Saint-Gilloise", mean: 250, flag: "🇧🇪", aliases: ["Union SG", "Royale Union Saint-Gilloise", "USG"] },
  { name: "Slavia Praha",       mean: 250, flag: "🇨🇿", aliases: ["Slavia Prague", "Slavia Prag", "SK Slavia Praha"] },
  { name: "FC København",       mean: 240, flag: "🇩🇰", aliases: ["Copenhagen", "FC Copenhagen", "FCK", "Kobenhavn"] },
  { name: "Qarabağ",            mean: 200, flag: "🇦🇿", aliases: ["Qarabag", "Qarabag FK"] },
  { name: "Pafos",              mean: 160, flag: "🇨🇾", aliases: ["Pafos FC", "Paphos"] },
  { name: "Kairat Almaty",      mean: 140, flag: "🇰🇿", aliases: ["Kairat", "FC Kairat"] },
];

const TOTAL_MEAN = RAW.reduce((s, t) => s + t.mean, 0);
/** Skalering så fairPrice-summen matcher ~4.000 mønter (som VM). */
const FAIR_SCALE = 4000 / TOTAL_MEAN;

export const CL2627_TEAMS: TournamentTeam[] = RAW.map((t) => ({
  name: t.name,
  group: "Liga",
  mean: t.mean,
  median: Math.round((t.mean * 0.85) / 50) * 50,
  stdDev: Math.round(t.mean * 0.6),
  fairPrice: Math.round(t.mean * FAIR_SCALE * 10) / 10,
  flag: t.flag,
  aliases: t.aliases,
}));

/** Case-insensitivt opslag inkl. aliasser. */
export function findCL2627Team(name: string): TournamentTeam | undefined {
  const n = name.trim().toLowerCase();
  return CL2627_TEAMS.find(
    (t) => t.name.toLowerCase() === n || t.aliases.some((a) => a.toLowerCase() === n),
  );
}
