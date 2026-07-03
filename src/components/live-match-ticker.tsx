"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { type ScoreMatch } from "@/lib/scoring";
import { getTournamentForGame, calcPointsForTournament } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

type MatchRow = ScoreMatch;

type LiveMatch = {
  id: string;
  homeTeam: string; awayTeam: string;
  homeFlag: string; awayFlag: string;
  homeScore: number; awayScore: number;
  homeOwner: { name: string; points: number } | null;
  awayOwner: { name: string; points: number } | null;
};

export function LiveMatchTicker({ gameId }: { gameId: string }) {
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);

  useEffect(() => {
    if (!gameId) return;
    void load();
    // Genindlæs hvert 60. sekund mens der er åbent
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  async function load() {
    const cfg = await getTournamentForGame(gameId);
    const findTeam = cfg.findTeam;
    const [matchesRes, gtRes, playersRes] = await Promise.all([
      supabase.from("wc_matches")
        .select("id,home_team,away_team,stage,home_score,away_score,result_type,winner_side,status")
        .eq("game_id", gameId),
      supabase.from("game_teams").select("team_id, owner_player_id").eq("game_id", gameId).not("owner_player_id", "is", null),
      supabase.from("players").select("id, name").eq("game_id", gameId),
    ]);

    const allMatches = (matchesRes.data ?? []) as (MatchRow & { id: string })[];
    const live = allMatches.filter((m) => m.status === "live");
    if (live.length === 0) { setLiveMatches([]); return; }

    const playerById = new Map((playersRes.data ?? []).map((p) => [String(p.id), String(p.name)]));

    // Holdnavn → ejer-spiller-id
    const teamIds = [...new Set((gtRes.data ?? []).map((r) => String(r.team_id)))];
    const { data: teamRows } = teamIds.length > 0
      ? await supabase.from("teams").select("id, name").in("id", teamIds)
      : { data: [] as { id: string; name: string }[] };

    const ownerIdByTeamName = new Map<string, string>();
    const ownedTeamsByPlayerId = new Map<string, string[]>();
    for (const gt of (gtRes.data ?? []) as { team_id: string; owner_player_id: string }[]) {
      const t = (teamRows ?? []).find((r) => String(r.id) === String(gt.team_id));
      if (!t) continue;
      const raw = String(t.name);
      const canon = findTeam(raw)?.name ?? raw;
      const pid = String(gt.owner_player_id);
      ownerIdByTeamName.set(canon.toLowerCase(), pid);
      ownerIdByTeamName.set(raw.toLowerCase(), pid);
      const arr = ownedTeamsByPlayerId.get(pid) ?? [];
      arr.push(raw);
      ownedTeamsByPlayerId.set(pid, arr);
    }

    // Spillerens totale point = sum over alle ejede hold
    const totalByPlayerId = new Map<string, number>();
    for (const [pid, teams] of ownedTeamsByPlayerId) {
      totalByPlayerId.set(pid, teams.reduce((s, t) => s + calcPointsForTournament(cfg, t, allMatches), 0));
    }

    function ownerInfo(teamName: string): { name: string; points: number } | null {
      const canon = findTeam(teamName)?.name ?? teamName;
      const pid = ownerIdByTeamName.get(canon.toLowerCase());
      if (!pid) return null;
      const name = playerById.get(pid);
      if (!name) return null;
      return { name, points: totalByPlayerId.get(pid) ?? 0 };
    }

    setLiveMatches(live.map((m) => {
      const homeTeam = findTeam(m.home_team)?.name ?? m.home_team;
      const awayTeam = findTeam(m.away_team)?.name ?? m.away_team;
      return {
        id: m.id,
        homeTeam, awayTeam,
        homeFlag: findTeam(homeTeam)?.flag ?? "🏳",
        awayFlag: findTeam(awayTeam)?.flag ?? "🏳",
        homeScore: m.home_score ?? 0,
        awayScore: m.away_score ?? 0,
        homeOwner: ownerInfo(m.home_team),
        awayOwner: ownerInfo(m.away_team),
      };
    }));
  }

  if (liveMatches.length === 0) return null;

  return (
    <div className="border-b border-emerald-500/20 bg-emerald-950/30 backdrop-blur-md">
      {liveMatches.map((m) => (
        <div key={m.id} className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 sm:px-6">
          {/* Live-indikator */}
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-emerald-400">
            <Zap className="size-2.5 animate-pulse" />
            Live
          </span>

          {/* Hjemmehold */}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
            <div className="min-w-0 text-right">
              <p className="truncate text-xs font-semibold text-white">{m.homeTeam}</p>
              {m.homeOwner && (
                <p className="truncate text-[0.6rem] text-amber-300/80">
                  {m.homeOwner.name}
                  <span className="ml-1 tabular-nums text-amber-300/50">{m.homeOwner.points.toLocaleString("da-DK")} pt</span>
                </p>
              )}
            </div>
            <span className="shrink-0 text-base leading-none">{m.homeFlag}</span>
          </div>

          {/* Score */}
          <span className={cn("shrink-0 rounded-lg bg-black/40 px-2.5 py-1 text-sm font-extrabold tabular-nums text-emerald-300")}>
            {m.homeScore}–{m.awayScore}
          </span>

          {/* Udehold */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="shrink-0 text-base leading-none">{m.awayFlag}</span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{m.awayTeam}</p>
              {m.awayOwner && (
                <p className="truncate text-[0.6rem] text-amber-300/80">
                  {m.awayOwner.name}
                  <span className="ml-1 tabular-nums text-amber-300/50">{m.awayOwner.points.toLocaleString("da-DK")} pt</span>
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
