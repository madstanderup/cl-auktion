/** Valutaer der kan væddes i. Værdierne matcher check-constrainten på side_bets.currency. */
export const SIDE_BET_CURRENCIES = [
  { value: "kr",         label: "Kroner",     short: "kr" },
  { value: "øl",         label: "Øl 🍺",      short: "🍺" },
  { value: "btc",        label: "BTC ₿",      short: "₿" },
  { value: "god_vin",    label: "God vin 🍷", short: "🍷 god vin" },
  { value: "dårlig_vin", label: "Dårlig vin 🍾", short: "🍾 dårlig vin" },
] as const;

export type SideBetCurrency = (typeof SIDE_BET_CURRENCIES)[number]["value"];

/** Formatterer stake + valuta, fx "50 kr", "3 🍺", "0,01 ₿", "2 🍷 god vin". */
export function formatStake(currency: string, stake: number): string {
  const c = SIDE_BET_CURRENCIES.find((c) => c.value === currency);
  const amount = stake.toLocaleString("da-DK", { maximumFractionDigits: 8 });
  return c ? `${amount} ${c.short}` : `${amount} ${currency}`;
}
