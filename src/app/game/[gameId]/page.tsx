"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "group",         label: "Gruppe" },
  { key: "round_of_32",  label: "1/16" },
  { key: "round_of_16",  label: "1/8" },
  { key: "quarter_final",label: "KV" },
  { key: "semi_final",   label: "SF" },
  { key: "final",        label: "Finale" },
];

type Player = {
  id: string;
  name: string;
  coins: number;
  points: number;
};

type Team = {
  id: string;
  name: string;
  flag_emoji: string | null;
  owner_id: string | null;
  owner_name: string | null;
};

type MatchRow = {
  id: string;
  home_team: string;
  away_team: string;
  stage: string;
  home_score: number | null;
  away_score: number | null;
  result_type: string | null;
  winner_side: string | null;
  status: string;
};

type GameInfo = {
  label: string | null;
  invite_code: string;
  auction_status: string | null;
};


export default function GameDashboard() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;
    void loadAll();
  }, [gameId]);

  async function loadAll() {
    setLoading(true);
    const supabase = createClient();

    const [gameRes, playersRes, teamsRes, matchesRes, auctionRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("players").select("id, name, coins, points").eq("game_id", gameId).order("points", { ascending: false }),
      supabase.from("game_teams")
        .select("team_id, owner_id, teams(id, name, flag_emoji), players(id, name)")
        .eq("game_id", gameId),
      supabase.from("wc_matches").select("id, home_team, away_team, stage, home_score, away_score, result_type, winner_side, status").eq("game_id", gameId),
      supabase.from("auction_state").select("status").eq("game_id", gameId).maybeSingle(),
    ]);

    const playerList: Player[] = (playersRes.data ?? []).map((p: Record<string, unknown>) => ({
      id: String(p.id),
      name: String(p.name),
      coins: Number(p.coins),
      points: Number(p.points),
    }));

    const teamList: Team[] = (teamsRes.data ?? []).map((gt: Record<string, unknown>) => {
      const t = gt.teams as { id: string; name: string; flag_emoji: string | null } | null;
      const owner = gt.players as { id: string; name: string } | null;
      return {
        id: t?.id ?? String(gt.team_id),
        name: t?.name ?? "?",
        flag_emoji: t?.flag_emoji ?? null,
        owner_id: owner?.id ?? (gt.owner_id ? String(gt.owner_id) : null),
        owner_name: owner?.name ?? null,
      };
    });

    const matchList: MatchRow[] = (matchesRes.data ?? []).map((m: Record<string, unknown>) => ({
      id: String(m.id),
      home_team: String(m.home_team),
      away_team: String(m.away_team),
      stage: String(m.stage),
      home_score: m.home_score != null ? Number(m.home_score) : null,
      away_score: m.away_score != null ? Number(m.away_score) : null,
      result_type: m.result_type ? String(m.result_type) : null,
      winner_side: m.winner_side ? String(m.winner_side) : null,
      status: String(m.status),
    }));

    setPlayers(playerList);
    setTeams(teamList);
    setMatches(matchList);
    setGameInfo({
      label: (gameRes.data as { label?: string | null } | null)?.label ?? null,
      invite_code: (gameRes.data as { invite_code?: string } | null)?.invite_code ?? "",
      auction_status: (auctionRes.data as { status?: string } | null)?.status ?? null,
    });
    setLoading(false);
  }

  // Helper: winner always determined by score (ET/pen score reflects actual winner)
  function isWinner(m: MatchRow, teamName: string): boolean {
    const hs = m.home_score ?? 0, as_ = m.away_score ?? 0;
    return (m.home_team === teamName && hs > as_) || (m.away_team === teamName && as_ > hs);
  }
  function isLoser(m: MatchRow, teamName: string): boolean {
    const plays = m.home_team === teamName || m.away_team === teamName;
    return plays && !isWinner(m, teamName);
  }

  // Build a map: teamName -> stageKey -> total points
  const pointsMatrix = new Map<string, Map<string, number>>();
  for (const team of teams) {
    const stageMap = new Map<string, number>();
    for (const stage of STAGES) {
      const stageMatches = matches.filter(
        (m) => m.stage === stage.key &&
               m.status === "finished" &&
               (m.home_team === team.name || m.away_team === team.name)
      );
      let pts = 0;
      for (const m of stageMatches) {
        const isET = m.result_type === "extra_time" || m.result_type === "penalties";
        const won = isWinner(m, team.name);
        const lost = isLoser(m, team.name);

        // Match points
        if (stage.key === "group") {
          const hs = m.home_score ?? 0, as_ = m.away_score ?? 0;
          if (hs === as_) pts += 50; // draw
          else if (won) pts += 150;  // win normal time in group
        } else {
          if (isET) {
            pts += 100; // both teams get 100 when match goes to ET/pen (50 draw + 50 bonus)
          } else if (won) {
            pts += 150; // win normal time in knockout
          }
        }

        // Advancement bonus: loser gets it
        if (stage.key !== "group" && lost) {
          if (stage.key === "round_of_32") pts += 100;
          else if (stage.key === "round_of_16") pts += 200;
          else if (stage.key === "quarter_final") pts += 400;
          else if (stage.key === "semi_final") pts += 600;
          else if (stage.key === "final") pts += 800;
        }

        // Tournament winner: +1000
        if (stage.key === "final" && won) pts += 1000;
      }
      stageMap.set(stage.key, pts);
    }
    pointsMatrix.set(team.name, stageMap);
  }

  const gameName = gameInfo?.label ?? (gameInfo ? `Spil ${gameInfo.invite_code}` : "Spil");
  const isActive = gameInfo?.auction_status && gameInfo.auction_status !== "finished";

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="size-4" />
            Forsiden
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-white">{gameName}</h1>
            {gameInfo && (
              <p className="mt-0.5 text-xs text-slate-500">
                Kode: <span className="font-mono tracking-wider text-slate-400">{gameInfo.invite_code}</span>
                {isActive && (
                  <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-medium text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Auktion igangværende
                  </span>
                )}
              </p>
            )}
          </div>
          {isActive && (
            <button
              type="button"
              onClick={() => router.push("/auction")}
              className="rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow transition hover:from-amber-200 hover:to-amber-200"
            >
              Gå til Auktion →
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-8 animate-spin text-amber-400/60" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* ── Standings ── */}
            <section className="rounded-2xl border border-white/[0.08] bg-slate-950/55 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-4">
                <Users className="size-4 text-blue-400/80" aria-hidden />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Stilling</h2>
              </div>
              {players.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500">Ingen spillere endnu.</p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {players.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-4 px-5 py-3">
                      <span className={cn(
                        "w-6 text-center text-sm font-bold",
                        i === 0 ? "text-amber-300" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-slate-600"
                      )}>
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium text-white">{p.name}</span>
                      <span className="text-sm font-semibold text-amber-200/90">{p.points} pt</span>
                      <span className="text-xs text-slate-500">{p.coins} 🪙</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Team × Stage matrix ── */}
            <section className="rounded-2xl border border-white/[0.08] bg-slate-950/55 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-4">
                <Trophy className="size-4 text-amber-400/90" aria-hidden />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Hold × Runde point</h2>
              </div>

              {teams.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500">Ingen hold i dette spil endnu.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.08]">
                        <th className="sticky left-0 z-10 bg-slate-950/90 px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
                          Hold
                        </th>
                        <th className="px-3 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
                          Ejer
                        </th>
                        {STAGES.map((s) => (
                          <th key={s.key} className="px-3 py-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
                            {s.label}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-amber-500/80">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {teams
                        .slice()
                        .sort((a, b) => {
                          const aTotal = [...(pointsMatrix.get(a.name)?.values() ?? [])].reduce((s, v) => s + v, 0);
                          const bTotal = [...(pointsMatrix.get(b.name)?.values() ?? [])].reduce((s, v) => s + v, 0);
                          return bTotal - aTotal;
                        })
                        .map((team) => {
                          const stageMap = pointsMatrix.get(team.name);
                          const total = [...(stageMap?.values() ?? [])].reduce((s, v) => s + v, 0);
                          return (
                            <tr key={team.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="sticky left-0 z-10 bg-slate-950/90 px-4 py-2.5 font-medium text-slate-200 whitespace-nowrap">
                                {team.flag_emoji && <span className="mr-1.5">{team.flag_emoji}</span>}
                                {team.name}
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                                {team.owner_name ?? <span className="text-slate-700">—</span>}
                              </td>
                              {STAGES.map((s) => {
                                const pts = stageMap?.get(s.key) ?? 0;
                                return (
                                  <td key={s.key} className="px-3 py-2.5 text-center">
                                    {pts > 0 ? (
                                      <span className="font-semibold text-amber-200/90">{pts}</span>
                                    ) : (
                                      <span className="text-slate-700">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2.5 text-center font-bold text-amber-300">
                                {total > 0 ? total : <span className="text-slate-700">0</span>}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
