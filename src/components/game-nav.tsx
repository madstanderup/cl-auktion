"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Gavel, ShieldCheck, Table2, TrendingUp, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { GAME_ADMIN_SESSION_KEY, type GameAdminSession } from "@/lib/player-storage";
import { cn } from "@/lib/utils";

export function GameNav({ gameId }: { gameId: string }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [auctionActive, setAuctionActive] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GAME_ADMIN_SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as GameAdminSession;
        setIsAdmin(s.gameId === gameId);
      }
    } catch { /* ignore */ }
    void supabase.from("auction_state").select("status").eq("game_id", gameId).maybeSingle()
      .then(({ data }) => setAuctionActive(!!data?.status && data.status !== "finished"));
  }, [gameId]);

  const base = `/game/${gameId}`;
  const links: { href: string; label: string; icon?: React.ReactNode; exact?: boolean }[] = [
    { href: base, label: "Spilside", icon: <Trophy className="size-3.5" />, exact: true },
    { href: `${base}/matches`, label: "Kampe", icon: <CalendarDays className="size-3.5" /> },
    { href: `${base}/bracket`, label: "🏆 Bracket" },
    { href: `${base}/bids`, label: "Budoversigt", icon: <Table2 className="size-3.5" /> },
    { href: `${base}/summary`, label: "Summary", icon: <TrendingUp className="size-3.5" /> },
    { href: `${base}/points`, label: "Pointoversigt", icon: <Trophy className="size-3.5" /> },
    { href: "/regler", label: "📖 Regler" },
  ];

  const isActive = (l: { href: string; exact?: boolean }) =>
    l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(l.href + "/");

  return (
    <nav className="border-b border-white/[0.06] bg-slate-950/50 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-1.5 overflow-x-auto px-3 py-2 scrollbar-none" style={{ scrollbarWidth: "none" }}>
        <Link href="/" className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors">
          <ArrowLeft className="size-3.5" /> Forsiden
        </Link>
        <span className="h-4 w-px shrink-0 bg-white/10" />
        {auctionActive && (
          <Link href="/auction" className={cn(buttonBase, "bg-amber-400/90 text-slate-950 hover:bg-amber-300 font-semibold")}>
            <Gavel className="size-3.5" /> Auktion
          </Link>
        )}
        {links.map((l) => (
          <Link key={l.href} href={l.href}
            className={cn(buttonBase, isActive(l) ? "bg-amber-400/20 text-amber-200" : "text-slate-300 hover:bg-white/[0.06] hover:text-white")}>
            {l.icon}{l.label}
          </Link>
        ))}
        {isAdmin && (
          <Link href="/auction/admin" className={cn(buttonBase, "text-slate-300 hover:bg-white/[0.06] hover:text-white")}>
            <ShieldCheck className="size-3.5" /> Admin
          </Link>
        )}
      </div>
    </nav>
  );
}

const buttonBase = "flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap";
