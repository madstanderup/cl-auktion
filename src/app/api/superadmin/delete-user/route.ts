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

  const { userId } = await request.json() as { userId?: string };
  if (!userId) return NextResponse.json({ error: "Manglende userId." }, { status: 400 });
  if (userId === user.id) return NextResponse.json({ error: "Du kan ikke slette dig selv." }, { status: 400 });

  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
