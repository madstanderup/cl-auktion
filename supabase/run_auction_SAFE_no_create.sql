/*
  Erstattet: brug i stedet

    supabase/run_auction_complete_fix.sql

  Årsag: public.bids er allerede optaget af lobby-skemaet (initial_schema).
  Appen bruger auction_room_bids. Den gamle fil referencede public.bids
  og skabte forvirring.
*/
