"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findWC2026Team } from "@/lib/wc2026-teams";
import { cn } from "@/lib/utils";

const STARTING_COINS = 1000;

type PlayerResult = {
  playerId: string;
  playerName: string;
  coinsSpent: number;
  teams: { name: string; mean: number; median: number }[];
  totalMean: number;
  totalMedian: number;
  meanPerCoin: number;
  medianPerCoin: number;
  unmatchedTeams: string[];
};

type SortKey = "mean" | "median";

export default function PredictionPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [results, setResults] = useState<PlayerResult[]>([]);
  const [gameLabel, setGameLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [auctionFinished, setAuctionFinished] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("mean");

  useEffect(() => {
    if (!gameId) return;
    void load();
  }, [gameId]);

  async function load() {
    setLoading(true);

    const [gameRes, auctionRes, playersRes, gtRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("auction_state").select("status").eq("game_id", gameId).maybeSingle(),
      supabase.from("players").select("id, name, coins").eq("game_id", gameId),
      supabase.from("game_teams").select("owner_player_id, team_id").eq("game_id", gameId).not("owner_player_id", "is", null),
    ]);

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    setGameLabel(g?.label ?? g?.invite_code ?? "Spil");

    const status = (auctionRes.data as { status?: string } | null)?.status;
    const finished = status === "finished";
    setAuctionFinished(finished);

    if (!finished) {
      setLoading(false);
      return;
    }

    // Hent holdnavne
    const teamIds = [...new Set((gtRes.data ?? []).map((r) => String(r.team_id)))];
    const { data: teamRows } = teamIds.length > 0
      ? await supabase.from("teams").select("id, name").in("id", teamIds)
      : { data: [] as { id: string; name: string }[] };

    const teamNameById = new Map((teamRows ?? []).map((t) => [String(t.id), String(t.name)]));

    // Byg: spillerId → liste af holdnavne
    const teamsByPlayer = new Map<string, string[]>();
    for (const row of (gtRes.data ?? [])) {
      if (!row.owner_player_id) continue;
      const pid = String(row.owner_player_id);
      const tname = teamNameById.get(String(row.team_id));
      if (!tname) continue;
      const arr = teamsByPlayer.get(pid) ?? [];
      arr.push(tname);
      teamsByPlayer.set(pid, arr);
    }

    const players = (playersRes.data ?? []) as { id: string; name: string; coins: number }[];

    const playerResults: PlayerResult[] = players.map((p) => {
      const ownedTeams = teamsByPlayer.get(p.id) ?? [];
      const coinsSpent = Math.max(0, STARTING_COINS - p.coins);

      const matched: { name: string; mean: number; median: number }[] = [];
      const unmatched: string[] = [];

      for (const teamName of ownedTeams) {
        const wc = findWC2026Team(teamName);
        if (wc) {
          matched.push({ name: teamName, mean: wc.mean, median: wc.median });
        } else {
          unmatched.push(teamName);
        }
      }

      const totalMean = matched.reduce((s, t) => s + t.mean, 0);
      const totalMedian = matched.reduce((s, t) => s + t.median, 0);

      return {
        playerId: p.id,
        playerName: p.name,
        coinsSpent,
        teams: matched.sort((a, b) => b.mean - a.mean),
        totalMean,
        totalMedian,
        meanPerCoin: coinsSpent > 0 ? totalMean / coinsSpent : 0,
        medianPerCoin: coinsSpent > 0 ? totalMedian / coinsSpent : 0,
        unmatchedTeams: unmatched,
      };
    });

    // Sortér efter valgt nøgle
    playerResults.sort((a, b) => b.meanPerCoin - a.meanPerCoin);
    setResults(playerResults);
    setLoading(false);
  }

  const sorted = [...results].sort((a, b) =>
    sortKey === "mean" ? b.meanPerCoin - a.meanPerCoin : b.medianPerCoin - a.medianPerCoin
  );

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <header className="border-b border-white/[0.08] bg-slate-950/40 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(`/game/${gameId}`)}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="size-4" />
              Spilside
            </button>
            <div className="h-4 w-px bg-white/10" />
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">Prediction</p>
              <p className="text-sm font-medium text-white">{gameLabel}</p>
            </div>
          </div>

          {/* Skift mellem gennemsnit og median */}
          {auctionFinished && !loading && (
            <div className="flex rounded-lg border border-white/10 bg-slate-900/60 p-1 text-xs">
              <button
                type="button"
                onClick={() => setSortKey("mean")}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  sortKey === "mean"
                    ? "bg-amber-400/20 text-amber-200"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                Gennemsnit
              </button>
              <button
                type="button"
                onClick={() => setSortKey("median")}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  sortKey === "median"
                    ? "bg-amber-400/20 text-amber-200"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                Median
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-8 animate-spin text-amber-400/60" />
          </div>
        ) : !auctionFinished ? (
          <div className="py-20 text-center">
            <TrendingUp className="mx-auto size-10 text-slate-600 mb-4" />
            <p className="text-slate-400 text-sm">
              Prognosen er tilgængelig når auktionen er afsluttet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 text-center mb-6">
              Sorteret efter <span className="text-amber-200/80">{sortKey === "mean" ? "gennemsnitlige" : "mediane"}</span> forventede point pr. mønt brugt — det bedste købmandsskab øverst.
            </p>

            {sorted.map((p, idx) => {
              const pts = sortKey === "mean" ? p.totalMean : p.totalMedian;
              const ppc = sortKey === "mean" ? p.meanPerCoin : p.medianPerCoin;
              const isFirst = idx === 0;

              return (
                <div
                  key={p.playerId}
                  className={cn(
                    "rounded-2xl border bg-slate-950/60 p-5 shadow-xl",
                    isFirst
                      ? "border-amber-400/40 shadow-amber-950/30"
                      : "border-white/10 shadow-blue-950/20"
                  )}
                >
                  {/* Topbar */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        idx === 0 ? "bg-amber-400/20 text-amber-300" :
                        idx === 1 ? "bg-slate-700/60 text-slate-300" :
                        idx === 2 ? "bg-orange-900/40 text-orange-400" :
                        "bg-slate-800/60 text-slate-500"
                      )}>
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-white">{p.playerName}</p>
                        <p className="text-xs text-slate-500">{p.teams.length} hold · {p.coinsSpent} mønter brugt</p>
                      </div>
                    </div>

                    {/* Nøgletal */}
                    <div className="flex gap-4 text-right shrink-0">
                      <div>
                        <p className="text-[0.65rem] uppercase tracking-wider text-slate-500">Forv. point</p>
                        <p className="text-lg font-bold tabular-nums text-amber-200">
                          {pts.toLocaleString("da-DK")}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.65rem] uppercase tracking-wider text-slate-500">Pt/mønt</p>
                        <p className={cn(
                          "text-lg font-bold tabular-nums",
                          isFirst ? "text-emerald-300" : "text-slate-200"
                        )}>
                          {ppc.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Holdliste */}
                  {p.teams.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {p.teams.map((t) => (
                        <div
                          key={t.name}
                          className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-1.5 text-xs"
                        >
                          <span className="text-slate-300 truncate">{t.name}</span>
                          <span className="ml-2 shrink-0 tabular-nums text-slate-500">
                            {(sortKey === "mean" ? t.mean : t.median).toLocaleString("da-DK")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ukendte hold */}
                  {p.unmatchedTeams.length > 0 && (
                    <p className="mt-2 text-xs text-red-400/70">
                      ⚠ Ingen prognosedata for: {p.unmatchedTeams.join(", ")}
                    </p>
                  )}
                </div>
              );
            })}

            <p className="mt-4 text-center text-xs text-slate-600">
              Forventede point baseret på {sortKey === "mean" ? "gennemsnit" : "median"} over 20.000 simulerede turneringer · WM 2026
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
