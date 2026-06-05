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

  // Delete in order: wc_matches, bids, game_teams, players, auction_state, games
  const tables = ["wc_matches", "bids", "game_teams", "players", "auction_state"];
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq("game_id", gameId);
    if (error) return NextResponse.json({ error: `Fejl ved sletning af ${table}: ${error.message}` }, { status: 500 });
  }

  const { error } = await admin.from("games").delete().eq("id", gameId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
