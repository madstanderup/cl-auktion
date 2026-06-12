-- Flere valutaer: BTC, god vin, dårlig vin
alter table public.side_bets drop constraint if exists side_bets_currency_check;
alter table public.side_bets add constraint side_bets_currency_check
  check (currency in ('kr', 'øl', 'btc', 'god_vin', 'dårlig_vin'));
