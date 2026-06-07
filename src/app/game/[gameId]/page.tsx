"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Gavel, Loader2, ShieldCheck, Table2, Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  GAME_ADMIN_SESSION_KEY,
  PLAYER_GAME_ID_KEY,
  PLAYER_ID_KEY,
} from "@/lib/player-storage";
import { TableIcon } from "lucide-react";

const STAGES = [
  { key: "group",          label: "Gruppe" },
  { key: "round_of_32",   label: "1/16" },
  { key: "round_of_16",   label: "1/8" },
  { key: "quarter_final", label: "KV" },
  { key: "semi_final",    label: "SF" },
  { key: "final",         label: "Finale" },
];

type Player = { id: string; name: string; coins: number; points: number };
type MatchRow = {
  home_team: string; away_team: string; stage: string;
  home_score: number | null; away_score: number | null;
  result_type: string | null; winner_side: string | null; status: string;
};

function calcTeamPoints(teamName: string, matches: MatchRow[]): number {
  let total = 0;
  for (const stage of STAGES) {
    const ms = matches.filter(
      (m) => m.stage === stage.key && m.status === "finished" &&
        (m.home_team === teamName || m.away_team === teamName),
    );
    for (const m of ms) {
      const hs = m.home_score ?? 0, as_ = m.away_score ?? 0;
      const isHome = m.home_team === teamName;
      const myScore = isHome ? hs : as_, opScore = isHome ? as_ : hs;
      const isET = m.result_type === "extra_time" || m.result_type === "penalties";
      // For penalties with tied score, use winner_side to determine won/lost
      let won: boolean, lost: boolean;
      if (m.result_type === "penalties" && m.winner_side) {
        won = (isHome && m.winner_side === "home") || (!isHome && m.winner_side === "away");
        lost = !won;
      } else {
        won = myScore > opScore;
        lost = myScore < opScore;
      }
      if (stage.key === "group") {
        if (hs === as_) total += 50;
        else if (won) total += 150;
      } else {
        if (isET) { total += 50; if (won) total += 50; }
        else if (won) total += 150;
        if (lost) {
          if (stage.key === "round_of_32") total += 100;
          else if (stage.key === "round_of_16") total += 200;
          else if (stage.key === "quarter_final") total += 400;
          else if (stage.key === "semi_final") total += 600;
          else if (stage.key === "final") total += 800;
        }
        if (stage.key === "final" && won) total += 1000;
      }
    }
  }
  return total;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [gameLabel, setGameLabel] = useState<string>("");
  const [auctionStatus, setAuctionStatus] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myTeams, setMyTeams] = useState<{ name: string; points: number }[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    // Sync localStorage so auction/score pages work if user navigates there
    try {
      localStorage.setItem(PLAYER_GAME_ID_KEY, gameId);
    } catch { /* ignore */ }

    // Check if this user is admin for this game
    try {
      const raw = localStorage.getItem(GAME_ADMIN_SESSION_KEY);
      if (raw) {
        const o = JSON.parse(raw) as { gameId?: string };
        setIsAdmin(o.gameId === gameId);
      }
    } catch { /* ignore */ }

    void load();
  }, [gameId]);

  async function load() {
    setLoading(true);

    // Get current player from localStorage
    let myPlayerId: string | null = null;
    try { myPlayerId = localStorage.getItem(PLAYER_ID_KEY); } catch { /* ignore */ }

    const [gameRes, playersRes, auctionRes, matchesRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("players").select("id, name, coins, points").eq("game_id", gameId).order("points", { ascending: false }),
      supabase.from("auction_state").select("status").eq("game_id", gameId).maybeSingle(),
      supabase.from("wc_matches").select("home_team,away_team,stage,home_score,away_score,result_type,winner_side,status").eq("game_id", gameId),
    ]);

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    setGameLabel(g?.label ?? g?.invite_code ?? "Spil");
    setAuctionStatus((auctionRes.data as { status?: string } | null)?.status ?? null);

    const playerList: Player[] = (playersRes.data ?? []).map((p: Record<string, unknown>) => ({
      id: String(p.id), name: String(p.name), coins: Number(p.coins), points: Number(p.points),
    }));
    setPlayers(playerList);

    const me = myPlayerId ? playerList.find((p) => p.id === myPlayerId) ?? null : null;
    setMyPlayer(me);

    const matches: MatchRow[] = (matchesRes.data ?? []).map((m: Record<string, unknown>) => ({
      home_team: String(m.home_team), away_team: String(m.away_team), stage: String(m.stage),
      home_score: m.home_score != null ? Number(m.home_score) : null,
      away_score: m.away_score != null ? Number(m.away_score) : null,
      result_type: m.result_type ? String(m.result_type) : null,
      winner_side: m.winner_side ? String(m.winner_side) : null,
      status: String(m.status),
    }));

    // Two-step team fetch to avoid FK join issues
    if (myPlayerId) {
      const { data: gtRows } = await supabase
        .from("game_teams")
        .select("team_id")
        .eq("game_id", gameId)
        .eq("owner_player_id", myPlayerId);

      const teamIds = (gtRows ?? []).map((r: Record<string, unknown>) => String(r.team_id));
      if (teamIds.length > 0) {
        const { data: teamRows } = await supabase
          .from("teams")
          .select("id, name")
          .in("id", teamIds);

        const teams = (teamRows ?? []).map((t: Record<string, unknown>) => ({
          name: String(t.name),
          points: calcTeamPoints(String(t.name), matches),
        }));
        setMyTeams(teams.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "da")));
      } else {
        setMyTeams([]);
      }
    }

    setLoading(false);
  }

  const isAuctionActive = auctionStatus && auctionStatus !== "finished";

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <header className="border-b border-white/[0.08] bg-slate-950/40 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="size-4" />
              Forsiden
            </button>
            <div className="h-4 w-px bg-white/10" />
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">Spil</p>
              <p className="text-sm font-medium text-white">{gameLabel}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAuctionActive && (
              <Link
                href="/auction"
                className={cn(buttonVariants({ size: "sm" }), "bg-amber-400 text-slate-950 hover:bg-amber-300 font-semibold text-xs")}
              >
                <Gavel className="size-3.5 mr-1" />
                Auktion
              </Link>
            )}
            <Link
              href={`/game/${gameId}/points`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-white/20 text-xs text-slate-200")}
            >
              <Trophy className="size-3.5 mr-1" />
              Pointoversigt
            </Link>
            {isAdmin && (
              <Link
                href="/auction/admin"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-white/20 text-xs text-slate-200")}
              >
                <ShieldCheck className="size-3.5 mr-1" />
                Admin
              </Link>
            )}
            <Link
              href={`/game/${gameId}/bids`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-white/20 text-xs text-slate-200")}
            >
              <Table2 className="size-3.5 mr-1" />
              Budoversigt
            </Link>
            <Link
              href="/regler"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-white/20 text-xs text-slate-200")}
            >
              📖 Regler
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-8 animate-spin text-amber-400/60" />
          </div>
        ) : (
          <div className="space-y-6">

            {/* ── Min info ── */}
            {myPlayer && (
              <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 shadow-xl shadow-blue-950/30">
                <p className="text-lg font-semibold text-white">{myPlayer.name}</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-500">Turneringspoint</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-amber-200">
                      {myPlayer.points.toLocaleString("da-DK")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-500">Mønter tilbage</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-100">
                      {myPlayer.coins.toLocaleString("da-DK")}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* ── Mine hold ── */}
            {myPlayer && (
              <section className="rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl shadow-blue-950/30">
                <div className="border-b border-white/[0.08] px-5 py-4 flex items-center gap-2">
                  <Trophy className="size-4 text-amber-400/80" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Mine hold</h2>
                  <span className="ml-auto text-xs text-slate-500">{myTeams.length} hold</span>
                </div>
                {myTeams.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-500">Ingen hold endnu.</p>
                ) : (
                  <ul className="divide-y divide-white/[0.06]">
                    {myTeams.map((team) => (
                      <li key={team.name} className="flex items-center justify-between gap-3 px-5 py-3">
                        <span className="text-sm font-medium text-slate-200">{team.name}</span>
                        {team.points > 0 ? (
                          <span className="tabular-nums text-sm font-semibold text-amber-200">
                            {team.points.toLocaleString("da-DK")} pt
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">0 pt</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* ── Rangliste ── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Users className="size-4 text-blue-400/80" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Rangliste</h2>
              </div>
              <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-slate-950/50">
                {players.map((p, idx) => (
                  <li
                    key={p.id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-3 text-sm",
                      p.id === myPlayer?.id && "bg-amber-500/10",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn(
                        "w-6 shrink-0 text-center font-mono text-xs",
                        idx === 0 ? "text-amber-300 font-bold" : idx === 1 ? "text-slate-300" : idx === 2 ? "text-amber-600" : "text-slate-600"
                      )}>
                        {idx + 1}
                      </span>
                      <span className="truncate font-medium text-white">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="tabular-nums font-semibold text-amber-200">{p.points.toLocaleString("da-DK")} pt</span>
                      <span className="text-xs text-slate-500">{p.coins} 🪙</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

          </div>
        )}
      </main>
    </div>
  );
}
