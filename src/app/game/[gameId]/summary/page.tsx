"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trophy, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findWC2026Team, simulateStandings, type PlayerSim } from "@/lib/wc2026-teams";
import { computeEliminatedTeams } from "@/lib/tournament";
import { canBuildBracket, simulateBracket, buildStrengthMap } from "@/lib/bracket";
import { formatStake } from "@/lib/side-bets";
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

type MatchRow = {
  home_team: string; away_team: string; stage: string;
  home_score: number | null; away_score: number | null;
  result_type: string | null; winner_side: string | null; status: string;
};

type TeamEntry = {
  name: string;
  flag: string;
  pricePaid: number;
  currentPoints: number;
  mean: number;
  median: number;
  stdDev: number;
  fairPrice: number;
};

const _STAGES = ["group","round_of_32","round_of_16","quarter_final","semi_final","final"];
const _STAGE_BONUS: Record<string, number> = { round_of_32:100, round_of_16:200, quarter_final:400, semi_final:600, final:800 };

function calcTeamPoints(teamName: string, matches: MatchRow[]): number {
  const normalName = findWC2026Team(teamName)?.name ?? teamName;
  let total = 0;
  for (const stage of _STAGES) {
    const ms = matches.filter((m) => m.stage === stage && m.status === "finished" && (m.home_team === normalName || m.away_team === normalName));
    for (const m of ms) {
      const isHome = m.home_team === normalName;
      const myScore = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
      const opScore = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0);
      let won = myScore > opScore;
      let lost = myScore < opScore;
      if (m.result_type === "penalties" && m.winner_side) {
        won = (isHome && m.winner_side === "home") || (!isHome && m.winner_side === "away");
        lost = !won;
      }
      const isET = m.result_type === "extra_time" || m.result_type === "penalties";
      if (stage === "group") {
        total += myScore === opScore ? 50 : won ? 150 : 0;
      } else {
        if (isET) { total += 50; if (won) total += 50; } else if (won) total += 150;
        if (lost) total += _STAGE_BONUS[stage] ?? 0; // avancement-bonus kun til taberen
        if (stage === "final" && won) total += 1000;
      }
    }
  }
  return total;
}

function roiLabel(pts: number, bid: number) {
  if (bid <= 0) return pts > 0 ? "∞" : null;
  return (pts / bid).toFixed(1) + "x";
}
function makeRoiColorFn(allTeams: { currentPoints: number; pricePaid: number }[]) {
  const rois = allTeams.filter((t) => t.pricePaid > 0).map((t) => t.currentPoints / t.pricePaid).sort((a, b) => a - b);
  const p30 = rois[Math.floor(rois.length * 0.3)] ?? 0;
  const p70 = rois[Math.floor(rois.length * 0.7)] ?? 0;
  return (pts: number, bid: number): string => {
    if (bid <= 0) return "text-slate-500";
    const r = pts / bid;
    return r >= p70 ? "text-emerald-400" : r >= p30 ? "text-amber-400" : "text-red-400";
  };
}

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

type SnapshotRow = { snapshot_date: string; player_id: string; win_prob: number };

type SideBetRow = {
  id: string;
  bookie_player_id: string;
  better_player_id: string;
  description: string;
  odds: number;
  stake: number;
  currency: string;
  status: string;
  created_at: string;
};

function calcVurdering(fairValueSum: number, coinsSpent: number): number {
  if (coinsSpent === 0) return 5;
  const ratio = fairValueSum / coinsSpent;
  // ratio=1 → 7/10, ratio=2 → 10/10, ratio=0.5 → 3.5/10
  return Math.min(10, Math.max(0, Math.round(ratio * 7 * 10) / 10));
}

export default function SummaryPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [results, setResults] = useState<PlayerResult[]>([]);
  const [pairwise, setPairwise] = useState<Record<string, Record<string, number>>>({});
  const [history, setHistory] = useState<SnapshotRow[]>([]);
  const [sideBets, setSideBets] = useState<SideBetRow[]>([]);
  const [playerNameById, setPlayerNameById] = useState<Map<string, string>>(new Map());
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

    const [gameRes, auctionRes, playersRes, gtRes, bidsRes, matchesRes, sideBetsRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("auction_state").select("status").eq("game_id", gameId).maybeSingle(),
      supabase.from("players").select("id, name, coins").eq("game_id", gameId),
      supabase.from("game_teams").select("owner_player_id, team_id").eq("game_id", gameId).not("owner_player_id", "is", null),
      supabase.from("auction_room_bids").select("player_id, team_name, amount, bid_phase, created_at").eq("game_id", gameId).order("bid_phase", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("wc_matches").select("home_team,away_team,stage,home_score,away_score,result_type,winner_side,status").eq("game_id", gameId),
      supabase.from("side_bets").select("id,bookie_player_id,better_player_id,description,odds,stake,currency,status,created_at").eq("game_id", gameId).eq("status", "accepted").order("created_at", { ascending: true }),
    ]);

    setSideBets((sideBetsRes.data ?? []) as SideBetRow[]);
    setPlayerNameById(new Map(
      ((playersRes.data ?? []) as { id: string; name: string }[]).map((p) => [String(p.id), String(p.name)])
    ));

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    setGameLabel(g?.label ?? g?.invite_code ?? "Spil");

    const status = (auctionRes.data as { status?: string } | null)?.status;
    setAuctionFinished(status === "finished");

    if (status !== "finished") { setLoading(false); return; }

    const allMatches = (matchesRes.data ?? []) as MatchRow[];

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
        currentPoints: calcTeamPoints(tname, allMatches),
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

    // Simulér vindersandsynligheder.
    // Hold der er færdige/slået ud låses til deres faktiske point (stdDev 0);
    // hold der stadig er med beholder før-turnerings-fordelingen, men med
    // allerede scorede point som gulv.
    setSimulating(true);
    const eliminated = computeEliminatedTeams(allMatches);
    const normName = (n: string) => (findWC2026Team(n)?.name ?? n).toLowerCase();
    // Kør async så UI ikke fryser
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    let winProbs: Record<string, number>;
    let pw: Record<string, Record<string, number>>;

    if (canBuildBracket(allMatches)) {
      // Bracket-bevidst: simulér de faktiske knockout-kampe gennem træet
      const playerIds = partial.map((p) => p.playerId);
      const basePoints = new Map(partial.map((p) => [p.playerId, p.teams.reduce((s, t) => s + t.currentPoints, 0)]));
      const ownerByTeam = new Map<string, string>();
      for (const p of partial) for (const t of p.teams) ownerByTeam.set(normName(t.name), p.playerId);
      // Allerede spillede knockout-kampe (deterministiske)
      const knownResults = new Map<string, string>();
      for (const m of allMatches) {
        if (m.status !== "finished" || m.stage === "group") continue;
        if (m.home_team === "TBD" || m.away_team === "TBD") continue;
        const hc = normName(m.home_team), ac = normName(m.away_team);
        let winnerHome: boolean;
        if (m.result_type === "penalties" && m.winner_side) winnerHome = m.winner_side === "home";
        else winnerHome = (m.home_score ?? 0) >= (m.away_score ?? 0);
        knownResults.set([hc, ac].sort().join("|"), winnerHome ? hc : ac);
      }
      ({ winProb: winProbs, pairwise: pw } = simulateBracket(allMatches, {
        playerIds, basePoints, strength: buildStrengthMap(), ownerByTeam, knownResults, N: 8000,
      }));
    } else {
      // Før gruppespillet er slut: uafhængig model (før-turnerings-fordeling + gulv)
      const sims: PlayerSim[] = partial.map((p) => ({
        playerId: p.playerId,
        teams: p.teams.map((t) =>
          eliminated.has(normName(t.name))
            ? { mean: t.currentPoints, stdDev: 0 }
            : { mean: t.mean, stdDev: t.stdDev, floor: t.currentPoints },
        ),
      }));
      ({ winProb: winProbs, pairwise: pw } = simulateStandings(sims, 8000));
    }

    setSimulating(false);
    setPairwise(pw);

    const full: PlayerResult[] = partial.map((p) => ({
      ...p,
      winProb: winProbs[p.playerId] ?? 0,
    }));

    setResults(full);
    setLoading(false);

    // Gem dagligt snapshot af vindersandsynlighed (ét pr. spil pr. dag) + hent historik
    const today = new Date().toLocaleDateString("sv-SE");
    const snapshotRows = full.map((p) => ({
      game_id: gameId,
      snapshot_date: today,
      player_id: p.playerId,
      win_prob: Math.round((winProbs[p.playerId] ?? 0) * 10000) / 10000,
      points: p.teams.reduce((s, t) => s + t.currentPoints, 0),
      teams_alive: p.teams.filter((t) => !eliminated.has(normName(t.name))).length,
    }));
    try {
      await supabase.from("win_prob_snapshots").upsert(snapshotRows, { onConflict: "game_id,snapshot_date,player_id" });
    } catch { /* ignore */ }
    void loadHistory();
  }

  async function loadHistory() {
    const { data } = await supabase
      .from("win_prob_snapshots")
      .select("snapshot_date, player_id, win_prob")
      .eq("game_id", gameId)
      .order("snapshot_date", { ascending: true });
    setHistory((data ?? []) as SnapshotRow[]);
  }

  const roiColor = makeRoiColorFn(results.flatMap((p) => p.teams));

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
            <p className="text-slate-400 text-sm">Summary er tilgængelig når auktionen er afsluttet.</p>
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
                      <ul className="space-y-1">
                        {p.teams.map((t) => {
                          const roi  = roiLabel(t.currentPoints, t.pricePaid);
                          const xRoi = t.pricePaid > 0 ? (t.mean / t.pricePaid).toFixed(1) + "x" : null;
                          return (
                            <li key={t.name} className="py-0.5">
                              {/* Linje 1: hold + faktiske tal */}
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="flex items-center gap-1.5 truncate text-slate-200">
                                  <span>{t.flag}</span>
                                  <span className="truncate">{t.name}</span>
                                </span>
                                <span className="flex items-center gap-2 shrink-0">
                                  {t.currentPoints > 0 && (
                                    <span className="tabular-nums text-amber-300/70">{t.currentPoints} pt</span>
                                  )}
                                  <span className="tabular-nums text-slate-500">{t.pricePaid} 🪙</span>
                                  {roi && (
                                    <span className={cn("font-bold tabular-nums", roiColor(t.currentPoints, t.pricePaid))}>
                                      {roi}
                                    </span>
                                  )}
                                </span>
                              </div>
                              {/* Linje 2: forventede tal */}
                              {t.mean > 0 && (
                                <div className="flex items-center justify-end gap-2 text-[0.6rem] text-slate-600 mt-0.5">
                                  <span>xP <span className="tabular-nums text-slate-500">{t.mean.toLocaleString("da-DK")}</span></span>
                                  {xRoi && <span>xROI <span className="tabular-nums text-slate-500">{xRoi}</span></span>}
                                </div>
                              )}
                            </li>
                          );
                        })}
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

              {/* ROI Highscore */}
              {(() => {
                const roiRanking = results
                  .flatMap((p) =>
                    p.teams
                      .filter((t) => t.pricePaid > 0)
                      .map((t) => ({
                        playerName: p.playerName,
                        teamName: t.name,
                        flag: t.flag,
                        pricePaid: t.pricePaid,
                        currentPoints: t.currentPoints,
                        roi: t.currentPoints / t.pricePaid,
                      }))
                  )
                  .filter((t) => t.currentPoints > 0)
                  .sort((a, b) => b.roi - a.roi)
                  .slice(0, 5);

                if (roiRanking.length === 0) return null;
                return (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-5 sm:col-span-2">
                    <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-300/80">
                      📈 ROI Highscore — bedste afkast pr. mønt
                    </p>
                    <ol className="space-y-2">
                      {roiRanking.map((t, i) => (
                        <li key={`${t.playerName}-${t.teamName}`} className="flex items-center gap-3 text-sm">
                          <span className={cn(
                            "w-5 shrink-0 text-center text-xs font-bold",
                            i === 0 ? "text-emerald-300" : "text-slate-500"
                          )}>
                            {i + 1}.
                          </span>
                          <span className="text-slate-400 text-xs shrink-0">{t.playerName}</span>
                          <span className="flex-1 truncate font-medium text-white">{t.flag} {t.teamName}</span>
                          <div className="shrink-0 flex items-center gap-3 text-xs">
                            <span className="tabular-nums text-amber-300/70">{t.currentPoints.toLocaleString("da-DK")} pt</span>
                            <span className="tabular-nums text-slate-500">{t.pricePaid} 🪙</span>
                            <span className={cn("font-bold tabular-nums text-sm", roiColor(t.currentPoints, t.pricePaid))}>
                              {(t.roi).toFixed(1)}x
                            </span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })()}

              {/* Sidebets */}
              {sideBets.length > 0 && (
                <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-5 sm:col-span-2">
                  <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-purple-300/80">
                    🎲 Sidebets — indgåede væddemål
                  </p>
                  <div className="space-y-2">
                    {sideBets.map((b) => {
                      const bookie = playerNameById.get(b.bookie_player_id) ?? "?";
                      const better = playerNameById.get(b.better_player_id) ?? "?";
                      const stakeLabel = formatStake(b.currency, Number(b.stake));
                      const payoutLabel = formatStake(b.currency, Number(b.odds) * Number(b.stake));
                      return (
                        <div key={b.id} className="rounded-lg border border-white/[0.07] bg-slate-950/50 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm">
                              <span className="font-semibold text-white">{bookie}</span>
                              <span className="text-[0.65rem] uppercase tracking-wider text-purple-300/70"> bookie </span>
                              <span className="text-slate-500">vs</span>
                              <span className="text-[0.65rem] uppercase tracking-wider text-purple-300/70"> better </span>
                              <span className="font-semibold text-white">{better}</span>
                            </p>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="font-bold tabular-nums text-amber-300">Odds {Number(b.odds).toLocaleString("da-DK")}</span>
                              <span className="tabular-nums text-slate-300">Stake {stakeLabel}</span>
                              <span className="tabular-nums text-emerald-300/80">Gevinst {payoutLabel}</span>
                            </div>
                          </div>
                          {b.description && (
                            <p className="mt-1 text-xs text-slate-400">»{b.description}«</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[0.6rem] text-slate-600">
                    Bookie udbetaler gevinsten (odds × stake) hvis better vinder — ellers beholder bookie staken.
                  </p>
                </div>
              )}

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
                  Tager højde for allerede spillede kampe — slåede hold er låst til deres faktiske point · WM 2026 · Ikke officiel forudsigelse
                </p>
              </div>

              {/* Vindchance over tid */}
              {(() => {
                const dates = [...new Set(history.map((h) => h.snapshot_date))].sort();
                if (dates.length < 2) return null;
                const CHART_COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f87171", "#a78bfa", "#fb923c"];
                const order = [...results].sort((a, b) => b.winProb - a.winProb);
                const W = 720, H = 250, padL = 38, padR = 12, padT = 12, padB = 28;
                const plotW = W - padL - padR, plotH = H - padT - padB;
                const x = (i: number) => padL + (dates.length === 1 ? plotW / 2 : (i / (dates.length - 1)) * plotW);
                const y = (p: number) => padT + (1 - p) * plotH;
                const byPlayerDate = new Map<string, number>();
                for (const h of history) byPlayerDate.set(`${h.player_id}|${h.snapshot_date}`, Number(h.win_prob));
                const fmt = (d: string) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; };
                const labelIdx = dates.length <= 4 ? dates.map((_, i) => i) : [0, Math.floor((dates.length - 1) / 2), dates.length - 1];

                return (
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 p-5 sm:col-span-2">
                    <p className="mb-4 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-blue-300/80">
                      📈 Vindchance over tid
                    </p>
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 260 }}>
                      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
                        <g key={g}>
                          <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                          <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize={10} fill="#64748b">{Math.round(g * 100)}%</text>
                        </g>
                      ))}
                      {labelIdx.map((i) => (
                        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#64748b">{fmt(dates[i])}</text>
                      ))}
                      {order.map((p, idx) => {
                        const color = CHART_COLORS[idx % CHART_COLORS.length];
                        const pts = dates
                          .map((d, i) => ({ i, v: byPlayerDate.get(`${p.playerId}|${d}`) }))
                          .filter((q) => q.v !== undefined) as { i: number; v: number }[];
                        if (pts.length === 0) return null;
                        const path = pts.map((q, k) => `${k === 0 ? "M" : "L"} ${x(q.i).toFixed(1)} ${y(q.v).toFixed(1)}`).join(" ");
                        return (
                          <g key={p.playerId}>
                            <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                            {pts.map((q) => <circle key={q.i} cx={x(q.i)} cy={y(q.v)} r={2.5} fill={color} />)}
                          </g>
                        );
                      })}
                    </svg>
                    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                      {order.map((p, idx) => (
                        <span key={p.playerId} className="flex items-center gap-1.5 text-xs text-slate-300">
                          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                          {p.playerName}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-center text-[0.65rem] text-slate-600">
                      Ét punkt pr. dag stillingen er blevet åbnet · {dates.length} målinger
                    </p>
                  </div>
                );
              })()}

              {/* Indbyrdes matrix */}
              {results.length >= 2 && Object.keys(pairwise).length > 0 && (() => {
                const order = [...results].sort((a, b) => b.winProb - a.winProb);
                const cellColor = (prob: number): string => {
                  // 0% rød → 50% neutral → 100% grøn
                  if (prob >= 0.5) {
                    const t = (prob - 0.5) / 0.5; // 0..1
                    const a = 0.1 + t * 0.35;
                    return `rgba(16, 185, 129, ${a.toFixed(2)})`; // emerald
                  } else {
                    const t = (0.5 - prob) / 0.5; // 0..1
                    const a = 0.1 + t * 0.35;
                    return `rgba(239, 68, 68, ${a.toFixed(2)})`; // red
                  }
                };

                return (
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 p-5 sm:col-span-2">
                    <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-300/80">
                      ⚔️ Indbyrdes sandsynligheder
                    </p>
                    <p className="mb-4 text-[0.65rem] text-slate-500">
                      Hver celle viser sandsynligheden for at <span className="text-slate-300">rækkens</span> spiller slutter højere end <span className="text-slate-300">kolonnens</span> spiller.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr>
                            <th className="sticky left-0 z-10 bg-slate-950/70 px-2 py-2 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500">
                              Slutter bedre end →
                            </th>
                            {order.map((p) => (
                              <th key={p.playerId} className="px-2 py-2 text-center text-[0.65rem] font-semibold text-slate-300 whitespace-nowrap">
                                {p.playerName}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {order.map((rowP) => (
                            <tr key={rowP.playerId}>
                              <td className="sticky left-0 z-10 bg-slate-950/70 px-2 py-2 text-left text-[0.65rem] font-semibold text-slate-300 whitespace-nowrap">
                                {rowP.playerName}
                              </td>
                              {order.map((colP) => {
                                if (rowP.playerId === colP.playerId) {
                                  return (
                                    <td key={colP.playerId} className="px-2 py-2 text-center text-slate-700 bg-white/[0.02]">
                                      —
                                    </td>
                                  );
                                }
                                const prob = pairwise[rowP.playerId]?.[colP.playerId] ?? 0;
                                return (
                                  <td
                                    key={colP.playerId}
                                    className="px-2 py-2 text-center tabular-nums font-semibold text-white"
                                    style={{ backgroundColor: cellColor(prob) }}
                                  >
                                    {Math.round(prob * 100)}%
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-center text-[0.65rem] text-slate-600">
                      Fx: {order[0]?.playerName} slutter bedre end {order[1]?.playerName} i {Math.round((pairwise[order[0]?.playerId]?.[order[1]?.playerId] ?? 0) * 100)}% af de simulerede turneringer
                    </p>
                  </div>
                );
              })()}

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
