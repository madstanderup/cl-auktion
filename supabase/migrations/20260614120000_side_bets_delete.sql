-- Tillad sletning af sidebets (bruges af spil-admin i UI)
drop policy if exists "side_bets_delete_anon" on public.side_bets;
create policy "side_bets_delete_anon"
on public.side_bets for delete to anon using (true);

drop policy if exists "side_bets_delete_authenticated" on public.side_bets;
create policy "side_bets_delete_authenticated"
on public.side_bets for delete to authenticated using (true);
