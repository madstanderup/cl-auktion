"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trophy, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findWC2026Team, simulateWinProbabilities, type PlayerSim } from "@/lib/wc2026-teams";
import { cn } from "@/lib/utils";

const STARTING_COINS = 1000;

const PLAYER_THEMES = [
  { header: "bg-gradient-to-r from-yellow-600 to-amber-700",   accent: "text-amber-300",  border: "border-amber-500/40",  badge: "bg-amber-500/20 text-amber-200" },
  { header: "bg-gradient-to-r from-emerald-600 to-green-800",  accent: "text-emerald-300", border: "border-emerald-500/40", badge: "bg-emerald-500/20 text-emerald-200" },
  { header: "bg-gradient-to-r from-blue-600 to-blue-900",      accent: "text-blue-300",    border: "border-blue-500/40",    badge: "bg-blue-500/20 text-blue-200" },
  { header: "bg-gradient-to-r from-red-600 to-rose-900",       accent: "text-red-300",     border: "border-red-500/40",     badge: "bg-red-500/20 text-red-200" },
  { header: "bg-gradient-to-r from-purple-600 to-violet-900",  accent: "text-purple-300",  border: "border-purple-500/40",  badge: "bg-purple-500/20 text-purple-200" },
  { header: "bg-gradient-to-r from-orange-500 to-orange-800",  accent: "text-orange-300",  border: "border-orange-500/40",  badge: "bg-orange-500/20 text-orange-200" },
];

type TeamEntry = {
  name: string;
  flag: string;
  pricePaid: number;
  mean: number;
  median: number;
  stdDev: number;
  fairPrice: number;
};

type PlayerResult = {
  playerId: string;
  playerName: string;
  coinsSpent: number;
  coinsLeft: number;
  teams: TeamEntry[];
  totalMean: number;
  totalMedian: number;
  fairValueSum: number;
  winProb: number;
  vurdering: number; // 0–10
  bestDeals: { name: string; flag: string; pricePaid: number; value: number }[];
  unmatchedTeams: string[];
};

type SortKey = "mean" | "median";

function calcVurdering(fairValueSum: number, coinsSpent: number): number {
  if (coinsSpent === 0) return 5;
  const ratio = fairValueSum / coinsSpent;
  // ratio=1 → 7/10, ratio=2 → 10/10, ratio=0.5 → 3.5/10
  return Math.min(10, Math.max(0, Math.round(ratio * 7 * 10) / 10));
}

export default function PredictionPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [results, setResults] = useState<PlayerResult[]>([]);
  const [gameLabel, setGameLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [auctionFinished, setAuctionFinished] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("mean");

  useEffect(() => {
    if (!gameId) return;
    void load();
  }, [gameId]);

  async function load() {
    setLoading(true);

    const [gameRes, auctionRes, playersRes, gtRes, bidsRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("auction_state").select("status").eq("game_id", gameId).maybeSingle(),
      supabase.from("players").select("id, name, coins").eq("game_id", gameId),
      supabase.from("game_teams").select("owner_player_id, team_id").eq("game_id", gameId).not("owner_player_id", "is", null),
      supabase.from("auction_room_bids").select("player_id, team_name, amount, bid_phase, created_at").eq("game_id", gameId).order("bid_phase", { ascending: false }).order("created_at", { ascending: false }),
    ]);

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    setGameLabel(g?.label ?? g?.invite_code ?? "Spil");

    const status = (auctionRes.data as { status?: string } | null)?.status;
    setAuctionFinished(status === "finished");

    if (status !== "finished") { setLoading(false); return; }

    // Holdnavne
    const teamIds = [...new Set((gtRes.data ?? []).map((r) => String(r.team_id)))];
    const { data: teamRows } = teamIds.length > 0
      ? await supabase.from("teams").select("id, name").in("id", teamIds)
      : { data: [] as { id: string; name: string }[] };

    const teamNameById = new Map((teamRows ?? []).map((t) => [String(t.id), String(t.name)]));

    // Bud: (teamName, playerId) → pricePaid  (highest bid_phase, latest created_at — already sorted)
    const allBids = (bidsRes.data ?? []) as { player_id: string; team_name: string; amount: number; bid_phase: number; created_at: string }[];
    const paidKey = (tname: string, pid: string) => `${tname}||${pid}`;
    const paidMap = new Map<string, number>();
    for (const b of allBids) {
      const k = paidKey(b.team_name, b.player_id);
      if (!paidMap.has(k)) paidMap.set(k, b.amount); // first = latest phase + latest time
    }

    // Hold per spiller
    const teamsByOwner = new Map<string, TeamEntry[]>();
    for (const row of (gtRes.data ?? []) as { owner_player_id: string; team_id: string }[]) {
      const pid = row.owner_player_id;
      const tname = teamNameById.get(row.team_id);
      if (!tname) continue;
      const wc = findWC2026Team(tname);
      const pricePaid = paidMap.get(paidKey(tname, pid)) ?? 0;
      const entry: TeamEntry = {
        name: tname,
        flag: wc?.flag ?? "🏳",
        pricePaid,
        mean: wc?.mean ?? 0,
        median: wc?.median ?? 0,
        stdDev: wc?.stdDev ?? 0,
        fairPrice: wc?.fairPrice ?? 0,
      };
      const arr = teamsByOwner.get(pid) ?? [];
      arr.push(entry);
      teamsByOwner.set(pid, arr);
    }

    const players = (playersRes.data ?? []) as { id: string; name: string; coins: number }[];

    // Byg foreløbige resultater (uden win-prob endnu)
    const partial: Omit<PlayerResult, "winProb">[] = players.map((p) => {
      const teams = (teamsByOwner.get(p.id) ?? []).sort((a, b) => b.mean - a.mean);
      const coinsSpent = Math.max(0, STARTING_COINS - p.coins);
      const totalMean = teams.reduce((s, t) => s + t.mean, 0);
      const totalMedian = teams.reduce((s, t) => s + t.median, 0);
      const fairValueSum = teams.reduce((s, t) => s + t.fairPrice, 0);

      // Bedste køb: højeste forventet point per mønt betalt
      const bestDeals = teams
        .filter((t) => t.pricePaid > 0)
        .map((t) => ({ name: t.name, flag: t.flag, pricePaid: t.pricePaid, value: t.mean / t.pricePaid }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 2);

      const unmatchedTeams = (teamsByOwner.get(p.id) ?? []).filter((t) => t.mean === 0 && t.median === 0).map((t) => t.name);

      return {
        playerId: p.id,
        playerName: p.name,
        coinsSpent,
        coinsLeft: p.coins,
        teams,
        totalMean,
        totalMedian,
        fairValueSum,
        vurdering: calcVurdering(fairValueSum, coinsSpent),
        bestDeals,
        unmatchedTeams,
      };
    });

    // Simulér vindersandsynligheder
    setSimulating(true);
    const sims: PlayerSim[] = partial.map((p) => ({
      playerId: p.playerId,
      teams: p.teams.map((t) => ({ mean: t.mean, stdDev: t.stdDev })),
    }));
    // Kør async så UI ikke fryser
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const winProbs = simulateWinProbabilities(sims, 8000);
    setSimulating(false);

    const full: PlayerResult[] = partial.map((p) => ({
      ...p,
      winProb: winProbs[p.playerId] ?? 0,
    }));

    setResults(full);
    setLoading(false);
  }

  const sorted = useMemo(
    () => [...results].sort((a, b) =>
      sortKey === "mean" ? b.totalMean - a.totalMean : b.totalMedian - a.totalMedian
    ),
    [results, sortKey],
  );

  // Globale statistikker
  const allDeals = useMemo(() =>
    results.flatMap((p) =>
      p.teams
        .filter((t) => t.pricePaid > 0)
        .map((t) => ({ ...t, playerName: p.playerName, value: t.mean / t.pricePaid }))
    ).sort((a, b) => b.value - a.value).slice(0, 5),
    [results],
  );

  const mostExpensive = useMemo(() =>
    results.flatMap((p) =>
      p.teams.map((t) => ({ ...t, playerName: p.playerName }))
    ).sort((a, b) => b.pricePaid - a.pricePaid).slice(0, 3),
    [results],
  );

  const totalCoins = results.reduce((s, p) => s + p.coinsSpent, 0);

  return (
    <div className="min-h-screen bg-[#060d1a] text-slate-100">
      {/* Baggrunds-glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_100%_50%_at_50%_0%,rgba(30,64,175,0.25),transparent_60%)]" />

      <header className="relative border-b border-white/[0.08] bg-slate-950/60 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push(`/game/${gameId}`)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="size-4" />
            Spilside
          </button>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {gameLabel}
          </p>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {loading || simulating ? (
          <div className="flex flex-col items-center justify-center gap-3 py-32">
            <Loader2 className="size-8 animate-spin text-amber-400/60" />
            <p className="text-sm text-slate-500">
              {simulating ? "Simulerer vindersandsynligheder…" : "Indlæser data…"}
            </p>
          </div>
        ) : !auctionFinished ? (
          <div className="py-20 text-center">
            <TrendingUp className="mx-auto size-10 text-slate-600 mb-4" />
            <p className="text-slate-400 text-sm">Prediction er tilgængelig når auktionen er afsluttet.</p>
          </div>
        ) : (
          <div className="space-y-8">

            {/* ── Titel ── */}
            <div className="text-center">
              <h1 className="text-3xl font-extrabold uppercase tracking-[0.12em] text-white sm:text-4xl">
                VM Auktion – Slutresultat
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Overblik over alle hold, køb og vurderinger
              </p>
              {/* Sortering */}
              <div className="mt-4 inline-flex rounded-lg border border-white/10 bg-slate-900/60 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSortKey("mean")}
                  className={cn(
                    "rounded-md px-4 py-1.5 font-medium transition-colors",
                    sortKey === "mean" ? "bg-amber-400/20 text-amber-200" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  Gennemsnit
                </button>
                <button
                  type="button"
                  onClick={() => setSortKey("median")}
                  className={cn(
                    "rounded-md px-4 py-1.5 font-medium transition-colors",
                    sortKey === "median" ? "bg-amber-400/20 text-amber-200" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  Median
                </button>
              </div>
            </div>

            {/* ── Spillerkort ── */}
            <div className={cn(
              "grid gap-4",
              sorted.length <= 2 ? "grid-cols-1 sm:grid-cols-2" :
              sorted.length === 3 ? "grid-cols-1 sm:grid-cols-3" :
              "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
            )}>
              {sorted.map((p, idx) => {
                const theme = PLAYER_THEMES[idx % PLAYER_THEMES.length];
                const pts = sortKey === "mean" ? p.totalMean : p.totalMedian;

                return (
                  <div
                    key={p.playerId}
                    className={cn(
                      "flex flex-col overflow-hidden rounded-2xl border shadow-2xl shadow-black/50",
                      theme.border,
                    )}
                  >
                    {/* Kort-header */}
                    <div className={cn("px-4 py-3", theme.header)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Trophy className="size-4 text-white/80" />
                          <span className="text-base font-extrabold uppercase tracking-wide text-white">
                            {p.playerName}
                          </span>
                        </div>
                        <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs font-semibold text-white/80">
                          {p.teams.length} hold
                        </span>
                      </div>
                    </div>

                    {/* Holdliste */}
                    <div className="flex-1 bg-slate-950/80 px-3 py-2">
                      <ul className="space-y-0.5">
                        {p.teams.map((t) => (
                          <li key={t.name} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                            <span className="flex items-center gap-1.5 truncate text-slate-200">
                              <span>{t.flag}</span>
                              <span className="truncate">{t.name}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-400">{t.pricePaid}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Statistik-boks */}
                    <div className="border-t border-white/[0.07] bg-slate-950/90 px-3 py-3 space-y-3">
                      {/* Bedste køb */}
                      {p.bestDeals.length > 0 && (
                        <div>
                          <p className="mb-1 text-[0.6rem] font-semibold uppercase tracking-widest text-slate-500">
                            Bedste køb
                          </p>
                          {p.bestDeals.map((d, i) => (
                            <div key={d.name} className="flex items-center justify-between text-xs">
                              <span className="text-slate-300">
                                {i + 1}. {d.flag} {d.name}
                              </span>
                              <span className={cn("font-semibold tabular-nums", theme.accent)}>
                                {d.pricePaid} 🪙
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Vurdering + Vindchance */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className={cn("rounded-lg border px-3 py-2 text-center", theme.border)}>
                          <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-slate-500">
                            Vurdering
                          </p>
                          <p className={cn("mt-0.5 text-xl font-extrabold tabular-nums", theme.accent)}>
                            {p.vurdering.toFixed(1)}
                            <span className="text-xs font-normal text-slate-500">/10</span>
                          </p>
                        </div>
                        <div className={cn("rounded-lg border px-3 py-2 text-center", theme.border)}>
                          <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-slate-500">
                            Vindchance
                          </p>
                          <p className={cn("mt-0.5 text-xl font-extrabold tabular-nums", theme.accent)}>
                            {Math.round(p.winProb * 100)}%
                          </p>
                        </div>
                      </div>

                      {/* Forventede point */}
                      <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
                        <span className="text-xs text-slate-400">
                          Forv. point ({sortKey === "mean" ? "gns" : "median"})
                        </span>
                        <span className={cn("text-sm font-bold tabular-nums", theme.accent)}>
                          {pts.toLocaleString("da-DK")}
                        </span>
                      </div>

                      {/* Mønter brugt */}
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Mønter brugt</span>
                        <span className="tabular-nums">{p.coinsSpent} / {STARTING_COINS}</span>
                      </div>

                      {p.unmatchedTeams.length > 0 && (
                        <p className="text-[0.6rem] text-red-400/70">
                          ⚠ Ingen data: {p.unmatchedTeams.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Bund-statistik ── */}
            <div className="grid gap-4 sm:grid-cols-2">

              {/* Bedste køb i auktionen */}
              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-5">
                <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-amber-300/80">
                  🏆 Auktionens bedste køb (top 5)
                </p>
                <ol className="space-y-2">
                  {allDeals.map((d, i) => (
                    <li key={`${d.playerName}-${d.name}`} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 shrink-0 text-xs text-slate-600">{i + 1}.</span>
                        <span className="text-slate-400 text-xs shrink-0">{d.playerName}</span>
                        <span className="truncate font-medium text-white">{d.flag} {d.name}</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="tabular-nums text-xs text-slate-400">{d.pricePaid} 🪙</span>
                        <span className="ml-2 tabular-nums text-xs font-semibold text-amber-300">
                          {d.mean.toLocaleString("da-DK")} pt
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Dyreste køb */}
              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-5">
                <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-rose-300/80">
                  💸 Auktionens dyreste køb (top 3)
                </p>
                <ol className="space-y-2">
                  {mostExpensive.map((d, i) => (
                    <li key={`${d.playerName}-${d.name}`} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 shrink-0 text-xs text-slate-600">{i + 1}.</span>
                        <span className="text-slate-400 text-xs shrink-0">{d.playerName}</span>
                        <span className="truncate font-medium text-white">{d.flag} {d.name}</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="tabular-nums font-semibold text-rose-300">{d.pricePaid} 🪙</span>
                        <span className="ml-2 tabular-nums text-xs text-slate-500">
                          ({d.fairPrice} fair)
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Total mønter i spil</span>
                    <span className="tabular-nums font-medium text-slate-300">{totalCoins.toLocaleString("da-DK")}</span>
                  </div>
                </div>
              </div>

              {/* Vindchance oversigt */}
              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-5 sm:col-span-2">
                <p className="mb-4 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-blue-300/80">
                  🎯 Vindchance oversigt — baseret på 8.000 simulerede turneringer
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[...results]
                    .sort((a, b) => b.winProb - a.winProb)
                    .map((p, idx) => {
                      const theme = PLAYER_THEMES[
                        sorted.findIndex((s) => s.playerId === p.playerId) % PLAYER_THEMES.length
                      ];
                      return (
                        <div key={p.playerId} className={cn("rounded-lg border p-4", theme.border)}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-white">{p.playerName}</span>
                            <span className="text-xs text-slate-500">#{idx + 1}</span>
                          </div>
                          {/* Søjle */}
                          <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", theme.header)}
                              style={{ width: `${Math.round(p.winProb * 100)}%` }}
                            />
                          </div>
                          <div className="mt-1.5 flex justify-between text-xs">
                            <span className="text-slate-500">
                              {(sortKey === "mean" ? p.totalMean : p.totalMedian).toLocaleString("da-DK")} pt
                            </span>
                            <span className={cn("font-bold tabular-nums", theme.accent)}>
                              {Math.round(p.winProb * 100)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
                <p className="mt-3 text-center text-[0.65rem] text-slate-600">
                  Vindchance er beregnet ud fra {sortKey === "mean" ? "gennemsnit" : "median"}-fordeling per hold · WM 2026 · Ikke officiel forudsigelse
                </p>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
