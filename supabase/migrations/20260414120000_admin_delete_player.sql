-- Slet en enkelt spiller (admin). Bud ryddes via ON DELETE CASCADE; holdejerskab nulstilles via ON DELETE SET NULL.

create or replace function public.admin_delete_player (p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if p_player_id is null then
    return jsonb_build_object('ok', false, 'error', 'player_id mangler');
  end if;

  select name into v_name from public.players where id = p_player_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Spiller findes ikke');
  end if;

  delete from public.players where id = p_player_id;

  return jsonb_build_object('ok', true, 'deleted_id', p_player_id, 'deleted_name', v_name);
end;
$$;

grant execute on function public.admin_delete_player (uuid) to anon, authenticated;

notify pgrst, 'reload schema';
