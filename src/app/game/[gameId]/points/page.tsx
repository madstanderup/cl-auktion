"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const STAGES = [
  { key: "group",          label: "Gruppe" },
  { key: "round_of_32",   label: "1/16" },
  { key: "round_of_16",   label: "1/8" },
  { key: "quarter_final", label: "KV" },
  { key: "semi_final",    label: "SF" },
  { key: "final",         label: "Finale" },
];

type Team = {
  id: string;
  name: string;
  flag_emoji: string | null;
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

function resolveWonLost(m: MatchRow, teamName: string): { won: boolean; lost: boolean } {
  const isHome = m.home_team === teamName;
  // For penalties: score can be tied — use winner_side if available
  if (m.result_type === "penalties" && m.winner_side) {
    const won = (isHome && m.winner_side === "home") || (!isHome && m.winner_side === "away");
    return { won, lost: !won };
  }
  const hs = m.home_score ?? 0, as_ = m.away_score ?? 0;
  const my = isHome ? hs : as_, op = isHome ? as_ : hs;
  return { won: my > op, lost: my < op };
}

function calcPoints(teams: Team[], matches: MatchRow[]) {
  const matrix = new Map<string, Map<string, number>>();

  for (const team of teams) {
    const stageMap = new Map<string, number>();
    for (const stage of STAGES) {
      const ms = matches.filter(
        (m) => m.stage === stage.key &&
               m.status === "finished" &&
               (m.home_team === team.name || m.away_team === team.name)
      );
      let pts = 0;
      for (const m of ms) {
        const hs = m.home_score ?? 0, as_ = m.away_score ?? 0;
        const isET = m.result_type === "extra_time" || m.result_type === "penalties";
        const { won, lost } = resolveWonLost(m, team.name);

        if (stage.key === "group") {
          if (hs === as_) pts += 50;
          else if (won) pts += 150;
        } else {
          if (isET) {
            pts += 50; // begge hold: 50 for uafgjort i ordinær tid
            if (won) pts += 50; // kun vinderen: 50 bonus for at vinde i ET/straffe
          } else if (won) {
            pts += 150;
          }
          // Avancement-bonus til taberen
          if (lost) {
            if (stage.key === "round_of_32") pts += 100;
            else if (stage.key === "round_of_16") pts += 200;
            else if (stage.key === "quarter_final") pts += 400;
            else if (stage.key === "semi_final") pts += 600;
            else if (stage.key === "final") pts += 800;
          }
          // Finalevinder
          if (stage.key === "final" && won) pts += 1000;
        }
      }
      stageMap.set(stage.key, pts);
    }
    matrix.set(team.name, stageMap);
  }
  return matrix;
}

export default function PointsPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [gameLabel, setGameLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;
    void load();
  }, [gameId]);

  async function load() {
    setLoading(true);
    const supabase = createClient();

    const [gameRes, teamsRes, matchesRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("game_teams")
        .select("team_id, owner_id, teams(id, name, flag_emoji), players(id, name)")
        .eq("game_id", gameId),
      supabase.from("wc_matches")
        .select("id, home_team, away_team, stage, home_score, away_score, result_type, winner_side, status")
        .eq("game_id", gameId),
    ]);

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    setGameLabel(g?.label ?? g?.invite_code ?? "Spil");

    const teamList: Team[] = (teamsRes.data ?? []).map((gt: Record<string, unknown>) => {
      const t = gt.teams as { id: string; name: string; flag_emoji: string | null } | null;
      const owner = gt.players as { id: string; name: string } | null;
      return {
        id: t?.id ?? String(gt.team_id),
        name: t?.name ?? "?",
        flag_emoji: t?.flag_emoji ?? null,
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

    setTeams(teamList);
    setMatches(matchList);
    setLoading(false);
  }

  const matrix = calcPoints(teams, matches);

  const sortedTeams = [...teams].sort((a, b) => {
    const aTotal = [...(matrix.get(a.name)?.values() ?? [])].reduce((s, v) => s + v, 0);
    const bTotal = [...(matrix.get(b.name)?.values() ?? [])].reduce((s, v) => s + v, 0);
    return bTotal - aTotal;
  });

  // Group teams by owner for grouping (optional sort: also sort within owner by total)
  const ownerOrder = Array.from(
    new Map(sortedTeams.map((t) => [t.owner_name ?? "—", true])).keys()
  );

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="size-4" />
            Tilbage
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-white">{gameLabel} — Pointoversigt</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Hold × runde · taberen af knockout-kampe får avancement-bonus
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className="size-3.5" />
            Opdater
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-8 animate-spin text-amber-400/60" />
          </div>
        ) : teams.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-16">Ingen hold i dette spil.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-slate-950/55 shadow-xl backdrop-blur-md">
            <table className="w-full min-w-max border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="sticky left-0 z-10 bg-slate-950/95 px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 min-w-[140px]">
                    Hold
                  </th>
                  <th className="px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 min-w-[100px]">
                    Ejer
                  </th>
                  {STAGES.map((s) => (
                    <th key={s.key} className="px-4 py-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 min-w-[60px]">
                      {s.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-amber-500/80 min-w-[60px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {ownerOrder.map((ownerName) => {
                  const ownerTeams = sortedTeams.filter((t) => (t.owner_name ?? "—") === ownerName);
                  return ownerTeams.map((team, idx) => {
                    const stageMap = matrix.get(team.name);
                    const total = [...(stageMap?.values() ?? [])].reduce((s, v) => s + v, 0);
                    const isFirstInGroup = idx === 0;
                    return (
                      <tr
                        key={team.id}
                        className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${isFirstInGroup && idx === 0 ? "border-t border-white/[0.06]" : ""}`}
                      >
                        <td className="sticky left-0 z-10 bg-slate-950/95 px-4 py-3 font-medium text-slate-200 whitespace-nowrap">
                          {team.flag_emoji && <span className="mr-1.5">{team.flag_emoji}</span>}
                          {team.name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isFirstInGroup ? (
                            <span className="font-medium text-slate-300">{ownerName}</span>
                          ) : (
                            <span className="text-slate-600">{ownerName}</span>
                          )}
                        </td>
                        {STAGES.map((s) => {
                          const pts = stageMap?.get(s.key) ?? 0;
                          return (
                            <td key={s.key} className="px-4 py-3 text-center">
                              {pts > 0 ? (
                                <span className="font-semibold text-amber-200/90">{pts}</span>
                              ) : (
                                <span className="text-slate-700">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center font-bold text-amber-300">
                          {total > 0 ? total : <span className="text-slate-700">0</span>}
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
