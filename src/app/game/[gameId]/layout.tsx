"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { supabase as anonClient } from "@/lib/supabase";
import {
  GAME_ADMIN_SESSION_KEY,
  PLAYER_GAME_ID_KEY,
  type GameAdminSession,
} from "@/lib/player-storage";
import { LiveMatchTicker } from "@/components/live-match-ticker";

const SUPERADMIN_EMAIL = "madstanderup@gmail.com";

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    if (!gameId) return;
    void check();
  }, [gameId]);

  async function check() {
    // 1. Er spiller i dette spil (localStorage)?
    const storedGameId = localStorage.getItem(PLAYER_GAME_ID_KEY);
    if (storedGameId === gameId) { setStatus("allowed"); return; }

    // 2. Er game-admin for dette spil (localStorage)?
    try {
      const raw = localStorage.getItem(GAME_ADMIN_SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as GameAdminSession;
        if (session.gameId === gameId) { setStatus("allowed"); return; }
      }
    } catch { /* ignore */ }

    // 3. Er superadmin (Supabase auth)?
    try {
      const authClient = createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user?.email === SUPERADMIN_EMAIL) { setStatus("allowed"); return; }

      // 4. Er logget ind som admin der ejer dette spil?
      if (user) {
        const { data } = await anonClient
          .from("games")
          .select("id")
          .eq("id", gameId)
          .eq("created_by", user.id)
          .maybeSingle();
        if (data) { setStatus("allowed"); return; }
      }
    } catch { /* ignore */ }

    setStatus("denied");
  }

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030711]">
        <Loader2 className="size-6 animate-spin text-amber-400/60" />
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#030711] text-slate-400">
        <ShieldOff className="size-10 text-slate-600" />
        <p className="text-sm">Du har ikke adgang til dette spil.</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-2 text-xs text-amber-400 hover:text-amber-300 underline"
        >
          Gå til forsiden
        </button>
      </div>
    );
  }

  return (
    <>
      <LiveMatchTicker gameId={gameId} />
      {children}
    </>
  );
}
