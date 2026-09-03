/**
 * Fair pris — hvad et hold er værd i mønter ved auktionen.
 *
 * Ligger i sit eget modul uden sideeffekter, så katalogerne og scripts kan
 * bruge det uden at trække Supabase-klienten med ind.
 */
/** Mønter hver spiller starter auktionen med. */
export const STARTING_COINS = 1000;

/**
 * Fair pris i mønter for ét hold — afhænger af hvor mange der byder.
 *
 * Møntpuljen er antal spillere × STARTING_COINS, og et hold er sin andel af
 * den værd. Med 4 spillere fordeles 4.000 mønter på holdene, med 6 spillere
 * 6.000, så priserne stiger 1:1 med feltets størrelse. Det holder også
 * vurderingen ærlig: uanset antal spillere ejer man i snit hold for ~1.000
 * mønter, præcis det man har at give ud.
 */
export function fairPriceFor(team: { fairShare: number } | undefined | null, playerCount: number): number {
  if (!team || playerCount <= 0) return 0;
  return Math.round(team.fairShare * playerCount * STARTING_COINS * 10) / 10;
}

/** Samlet møntpulje i et spil med så mange spillere. */
export function coinPool(playerCount: number): number {
  return Math.max(0, playerCount) * STARTING_COINS;
}
