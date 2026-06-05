import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SUPERADMIN_EMAIL = "madstanderup@gmail.com";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== SUPERADMIN_EMAIL) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const { gameId } = await request.json() as { gameId?: string };
  if (!gameId) return NextResponse.json({ error: "Manglende gameId." }, { status: 400 });

  const admin = adminClient();

  // First delete auction_room_bids via player_id (no game_id column on that table)
  const { data: playerIds } = await admin.from("players").select("id").eq("game_id", gameId);
  if (playerIds && playerIds.length > 0) {
    const ids = playerIds.map((p: { id: string }) => p.id);
    const { error } = await admin.from("auction_room_bids").delete().in("player_id", ids);
    if (error) return NextResponse.json({ error: `Fejl ved sletning af bud: ${error.message}` }, { status: 500 });
  }

  // Delete remaining tables that have game_id
  const tables = ["wc_matches", "game_teams", "players", "auction_state"];
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq("game_id", gameId);
    if (error) return NextResponse.json({ error: `Fejl ved sletning af ${table}: ${error.message}` }, { status: 500 });
  }

  const { error } = await admin.from("games").delete().eq("id", gameId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
