-- Kør denne i Supabase SQL Editor (dashboard) hvis migrations ikke køres via CLI.
-- Tillad bud på 0 mønter i auktionsrummet.

alter table public.auction_room_bids
  drop constraint if exists auction_room_bids_amount_check;

alter table public.auction_room_bids
  add constraint auction_room_bids_amount_check check (amount >= 0);

notify pgrst, 'reload schema';
