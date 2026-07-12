-- Tillad bud på 0 mønter i auktionsrummet.
-- Spillere uden mønter byder automatisk 0 fra klienten, så runden ikke
-- blokeres af at de aldrig kan afgive et gyldigt bud.

alter table public.auction_room_bids
  drop constraint if exists auction_room_bids_amount_check;

alter table public.auction_room_bids
  add constraint auction_room_bids_amount_check check (amount >= 0);

notify pgrst, 'reload schema';
