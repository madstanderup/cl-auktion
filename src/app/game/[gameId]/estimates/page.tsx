"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findWC2026Team } from "@/lib/wc2026-teams";
import { computeEliminatedTeams, type TMatch } from "@/lib/tournament";
import { canBuildBracket, simulateTeamPoints, buildStrengthMap } from "@/lib/bracket";
import { calcTeamPoints } from "@/lib/standings";
import { cn } from "@/lib/utils";

const OWNER_COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f87171", "#a78bfa", "#fb923c"];

type Row = { name: string; flag: string; owner: string | null; color?: string; current: number; est: number; startEst: number; out: boolean };

export default function EstimatesPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [loading, setLoading] = useState(true);
  const [gameLabel, setGameLabel] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [bracketBased, setBracketBased] = useState(false);

  useEffect(() => { if (gameId) void load(); }, [gameId]);

  async function load() {
    setLoading(true);
    const [gameRes, gtRes, teamsRes, playersRes, matchesRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("game_teams").select("team_id, owner_player_id").eq("game_id", gameId).not("owner_player_id", "is", null),
      supabase.from("teams").select("id, name"),
      supabase.from("players").select("id, name").eq("game_id", gameId),
      supabase.from("wc_matches").select("home_team,away_team,stage,home_score,away_score,result_type,winner_side,status").eq("game_id", gameId),
    ]);

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    setGameLabel(g?.label ?? g?.invite_code ?? "Spil");

    const teamNameById = new Map(((teamsRes.data ?? []) as Record<string, unknown>[]).map((t) => [String(t.id), String(t.name)]));
    const playerNameById = new Map(((playersRes.data ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), String(p.name)]));
    const colorByOwner = new Map<string, string>();
    [...new Set(playerNameById.values())].forEach((nm, i) => colorByOwner.set(nm, OWNER_COLORS[i % OWNER_COLORS.length]));

    const matches = ((matchesRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
      home_team: String(m.home_team), away_team: String(m.away_team), stage: String(m.stage),
      home_score: m.home_score != null ? Number(m.home_score) : null,
      away_score: m.away_score != null ? Number(m.away_score) : null,
      result_type: m.result_type ? String(m.result_type) : null,
      winner_side: m.winner_side ? String(m.winner_side) : null,
      status: String(m.status),
    })) as TMatch[];

    const norm = (n: string) => (findWC2026Team(n)?.name ?? n).toLowerCase();
    const eliminated = computeEliminatedTeams(matches);

    // Ejede hold + nuværende point
    const owned: { canon: string; raw: string; owner: string | null }[] = [];
    const currentByTeam = new Map<string, number>();
    for (const gt of (gtRes.data ?? []) as Record<string, unknown>[]) {
      const raw = teamNameById.get(String(gt.team_id));
      if (!raw) continue;
      const canon = norm(raw);
      owned.push({ canon, raw, owner: playerNameById.get(String(gt.owner_player_id)) ?? null });
      currentByTeam.set(canon, calcTeamPoints(raw, matches));
    }

    const useBracket = canBuildBracket(matches);
    setBracketBased(useBracket);
    const est = useBracket
      ? simulateTeamPoints(matches, { strength: buildStrengthMap(), currentByTeam, N: 30000 })
      : new Map<string, number>();

    const built: Row[] = owned.map(({ canon, raw, owner }) => {
      const wc = findWC2026Team(raw);
      const cur = currentByTeam.get(canon) ?? 0;
      const startEst = wc?.mean ?? 0;
      const estVal = useBracket ? (est.get(canon) ?? cur) : startEst;
      return {
        name: wc?.name ?? raw,
        flag: wc?.flag ?? "🏳",
        owner,
        color: owner ? colorByOwner.get(owner) : undefined,
        current: cur,
        est: estVal,
        startEst,
        out: eliminated.has(canon),
      };
    }).sort((a, b) => b.est - a.est);

    setRows(built);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <header className="border-b border-white/[0.08] bg-slate-950/40 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button type="button" onClick={() => router.push(`/game/${gameId}/summary`)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft className="size-4" /> Summary
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">Holdestimater</p>
            <p className="text-sm font-medium text-white">{gameLabel}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="size-8 animate-spin text-amber-400/60" /></div>
        ) : (
          <>
            {/* Forklaring */}
            <div className="mb-5 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-400">
              <p className="mb-2 font-semibold text-slate-200">Sådan beregnes estimatet</p>
              {bracketBased ? (
                <p>
                  <span className="text-slate-300">Est.</span> = point holdet allerede har scoret + det gennemsnitlige
                  udbytte fra <span className="text-slate-300">30.000 simulerede gennemspilninger</span> af knockout-bracket'en.
                  Hver kamp afgøres ud fra holdenes styrke (forventede point), vinderen føres videre, og point tildeles efter
                  reglerne (sejr 150, avancement-bonus til taberen, finalevinder +1.000). Slåede hold er låst på deres nuværende point.
                </p>
              ) : (
                <p>Gruppespillet er ikke færdigt endnu — estimatet er holdets <span className="text-slate-300">før-turnerings-forventning</span>. Når gruppespillet er slut, skifter det til en fuld bracket-simulering.</p>
              )}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-slate-950/55">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[0.6rem] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-3 text-left w-8">#</th>
                    <th className="px-3 py-3 text-left">Hold</th>
                    <th className="px-3 py-3 text-left">Ejer</th>
                    <th className="px-3 py-3 text-right">Est. start</th>
                    <th className="px-3 py-3 text-right">Nu</th>
                    <th className="px-3 py-3 text-right text-emerald-400/80">Est. nu</th>
                    <th className="px-3 py-3 text-right">Udvikling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {rows.map((r, i) => {
                    const delta = r.est - r.startEst;
                    return (
                      <tr key={r.name} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 text-xs text-slate-600 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={cn("mr-1.5", r.out && "opacity-50")}>{r.flag}</span>
                          <span className={cn("font-medium", r.out ? "text-slate-500 line-through" : "text-slate-200")}>{r.name}</span>
                          {r.out && <span className="ml-1.5 rounded bg-red-500/15 px-1 text-[0.55rem] font-medium text-red-400/90">ude</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {r.owner && (
                            <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-semibold" style={{ backgroundColor: `${r.color}22`, color: r.color }}>
                              {r.owner}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{Math.round(r.startEst).toLocaleString("da-DK")}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{r.current.toLocaleString("da-DK")}</td>
                        <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", r.out ? "text-slate-600" : "text-emerald-300")}>
                          {Math.round(r.est).toLocaleString("da-DK")}
                        </td>
                        <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", Math.round(delta) > 0 ? "text-emerald-400" : Math.round(delta) < 0 ? "text-red-400" : "text-slate-600")}>
                          {delta > 0 ? "+" : ""}{Math.round(delta).toLocaleString("da-DK")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
