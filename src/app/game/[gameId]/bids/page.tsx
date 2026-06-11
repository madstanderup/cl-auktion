"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

type Player = { id: string; name: string };

type MatchRow = {
  home_team: string; away_team: string; stage: string;
  home_score: number | null; away_score: number | null;
  result_type: string | null; winner_side: string | null; status: string;
};

type RoundRow = {
  order: number;
  roundId: string;
  teamName: string;
  winnerPlayerId: string | null;
  teamPoints: number;
  bids: Record<string, number>;
};

const STAGES = ["group","round_of_32","round_of_16","quarter_final","semi_final","final"];
const STAGE_BONUS: Record<string, number> = { round_of_32:100, round_of_16:200, quarter_final:400, semi_final:600, final:800 };

function calcTeamPoints(teamName: string, matches: MatchRow[]): number {
  let total = 0;
  for (const stage of STAGES) {
    const ms = matches.filter((m) => m.stage === stage && m.status === "finished" && (m.home_team === teamName || m.away_team === teamName));
    for (const m of ms) {
      const isHome = m.home_team === teamName;
      const myScore = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
      const opScore = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0);
      let won = myScore > opScore;
      if (m.result_type === "penalties" && m.winner_side) won = (isHome && m.winner_side === "home") || (!isHome && m.winner_side === "away");
      const isET = m.result_type === "extra_time" || m.result_type === "penalties";
      if (stage === "group") {
        total += myScore === opScore ? 50 : won ? 150 : 0;
      } else {
        if (isET) { total += 50; if (won) total += 50; } else if (won) total += 150;
        total += STAGE_BONUS[stage] ?? 0; // both teams get stage bonus
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
function roiColor(pts: number, bid: number) {
  if (bid <= 0) return "text-slate-500";
  const r = pts / bid;
  return r >= 8 ? "text-emerald-400" : r >= 4 ? "text-amber-400" : "text-red-400";
}

export default function BidsPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [players, setPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [gameLabel, setGameLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;
    void load();
  }, [gameId]);

  async function load() {
    setLoading(true);

    const [gameRes, playersRes, bidsRes, teamsRes, teamNamesRes, matchesRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("players").select("id, name").eq("game_id", gameId).order("name"),
      supabase.from("auction_room_bids")
        .select("round_id, bid_phase, player_id, amount, created_at, team_name")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true }),
      supabase.from("game_teams").select("team_id, owner_player_id").eq("game_id", gameId),
      supabase.from("teams").select("id, name"),
      supabase.from("wc_matches")
        .select("home_team,away_team,stage,home_score,away_score,result_type,winner_side,status")
        .eq("game_id", gameId),
    ]);

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    setGameLabel(g?.label ?? g?.invite_code ?? "Spil");

    const playerList: Player[] = (playersRes.data ?? []).map((p: Record<string, unknown>) => ({
      id: String(p.id),
      name: String(p.name),
    }));
    setPlayers(playerList);

    const allBids = (bidsRes.data ?? []) as {
      round_id: string; bid_phase: number; player_id: string; amount: number;
      created_at: string; team_name: string;
    }[];

    const gameTeams = (teamsRes.data ?? []) as { team_id: string; owner_player_id: string | null }[];
    const teamNameMap = new Map(
      ((teamNamesRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
    );

    // Build owner lookup: team_name → owner_player_id
    // We'll match via the bids' team_name field
    const ownerByTeamName = new Map<string, string>();
    for (const gt of gameTeams) {
      if (gt.owner_player_id) {
        const name = teamNameMap.get(gt.team_id);
        if (name) ownerByTeamName.set(name, gt.owner_player_id);
      }
    }

    // Group bids by round_id
    const byRound = new Map<string, typeof allBids>();
    for (const bid of allBids) {
      if (!byRound.has(bid.round_id)) byRound.set(bid.round_id, []);
      byRound.get(bid.round_id)!.push(bid);
    }

    // For each round: find team name, max bid_phase, latest bid per player in that phase
    // Sort rounds by first bid created_at
    const roundEntries = [...byRound.entries()].map(([roundId, bids]) => {
      const firstBidAt = bids[0].created_at; // already ordered ASC
      const teamName = bids[0].team_name;
      const maxPhase = Math.max(...bids.map((b) => b.bid_phase));

      // Latest bid per player in final phase
      const finalPhaseBids = bids.filter((b) => b.bid_phase === maxPhase);
      const latestByPlayer = new Map<string, number>();
      for (const b of finalPhaseBids) {
        // bids are ordered by created_at ASC, so last one wins
        latestByPlayer.set(b.player_id, b.amount);
      }

      const matches = (matchesRes.data ?? []) as MatchRow[];
      return {
        roundId,
        teamName,
        firstBidAt,
        winnerPlayerId: ownerByTeamName.get(teamName) ?? null,
        teamPoints: calcTeamPoints(teamName, matches),
        bids: Object.fromEntries(latestByPlayer),
      };
    });

    // Vis kun afsluttede runder (holdet har fået en ejer = vinder er fundet)
    const finishedEntries = roundEntries.filter((r) => r.winnerPlayerId !== null);

    // Sort by first bid timestamp = draw order
    finishedEntries.sort((a, b) => a.firstBidAt.localeCompare(b.firstBidAt));

    setRounds(
      finishedEntries.map((r, i) => ({
        order: i + 1,
        roundId: r.roundId,
        teamName: r.teamName,
        winnerPlayerId: r.winnerPlayerId,
        teamPoints: r.teamPoints,
        bids: r.bids,
      }))
    );

    setLoading(false);
  }

  function exportCSV() {
    const header = ["#", "Hold", ...players.map((p) => p.name)];
    const rows = rounds.map((r) => [
      String(r.order),
      r.teamName,
      ...players.map((p) => {
        const bid = r.bids[p.id];
        return bid != null ? String(bid) : "";
      }),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budoversigt-${gameLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <header className="border-b border-white/[0.08] bg-slate-950/40 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">Budoversigt</p>
              <p className="text-sm font-medium text-white">{gameLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={exportCSV}
            disabled={loading || rounds.length === 0}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-white/20 text-xs text-slate-200 gap-1.5"
            )}
          >
            <Download className="size-3.5" />
            Eksportér CSV
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-2 py-8 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-8 animate-spin text-amber-400/60" />
          </div>
        ) : rounds.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">
            Ingen bud endnu — auktionen er ikke startet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-slate-950/80">
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-10">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Hold</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">ROI</th>
                  {players.map((p) => (
                    <th key={p.id} className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {rounds.map((r) => {
                  // Highest bid in this round = winning amount
                  const maxBid = Math.max(...Object.values(r.bids).filter((v) => v != null));
                  const winnerBid = r.winnerPlayerId ? (r.bids[r.winnerPlayerId] ?? 0) : 0;
                  const roi = roiLabel(r.teamPoints, winnerBid);
                  return (
                    <tr key={r.roundId} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-3 py-3 text-xs text-slate-600 tabular-nums">{r.order}</td>
                      <td className="px-3 py-3 font-medium text-slate-200 whitespace-nowrap">
                        <div>{r.teamName}</div>
                        {r.teamPoints > 0 && <div className="text-[0.65rem] text-amber-300/70 tabular-nums">{r.teamPoints.toLocaleString("da-DK")} pt</div>}
                      </td>
                      <td className={cn("px-3 py-3 text-right text-sm font-bold tabular-nums whitespace-nowrap", roi ? roiColor(r.teamPoints, winnerBid) : "text-slate-700")}>
                        {roi ?? "—"}
                      </td>
                      {players.map((p) => {
                        const bid = r.bids[p.id];
                        const isWinner = r.winnerPlayerId === p.id;
                        const isMax = bid != null && bid === maxBid;
                        return (
                          <td
                            key={p.id}
                            className={cn(
                              "px-3 py-3 text-right tabular-nums whitespace-nowrap",
                              isWinner
                                ? "font-bold text-amber-300"
                                : isMax
                                ? "font-semibold text-slate-200"
                                : "text-slate-500"
                            )}
                          >
                            {bid != null ? bid.toLocaleString("da-DK") : (
                              <span className="text-slate-700">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rounds.length > 0 && (
          <p className="mt-3 text-xs text-slate-600 text-center">
            {rounds.length} hold · Vinderens bud er markeret med <span className="text-amber-300 font-bold">guld</span>
          </p>
        )}
      </main>
    </div>
  );
}
