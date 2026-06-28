"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findWC2026Team } from "@/lib/wc2026-teams";
import { canBuildBracket, buildFullBracket, type BracketMatch, type Round } from "@/lib/bracket";
import { cn } from "@/lib/utils";

type MatchRow = {
  home_team: string; away_team: string; stage: string;
  home_score: number | null; away_score: number | null;
  result_type: string | null; winner_side: string | null; status: string;
};

const ROUNDS: { key: Round; label: string }[] = [
  { key: "round_of_32", label: "1/16-finale" },
  { key: "round_of_16", label: "1/8-finale" },
  { key: "quarter_final", label: "Kvartfinale" },
  { key: "semi_final", label: "Semifinale" },
  { key: "final", label: "Finale" },
];

const OWNER_COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f87171", "#a78bfa", "#fb923c"];

export default function BracketPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [loading, setLoading] = useState(true);
  const [gameLabel, setGameLabel] = useState("");
  const [available, setAvailable] = useState(false);
  const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [ownerByTeam, setOwnerByTeam] = useState<Map<string, string>>(new Map());
  const [colorByOwner, setColorByOwner] = useState<Map<string, string>>(new Map());

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

    const owner = new Map<string, string>();
    for (const gt of (gtRes.data ?? []) as Record<string, unknown>[]) {
      const tn = teamNameById.get(String(gt.team_id));
      const nm = playerNameById.get(String(gt.owner_player_id));
      if (tn && nm) owner.set((findWC2026Team(tn)?.name ?? tn).toLowerCase(), nm);
    }
    setOwnerByTeam(owner);

    const colors = new Map<string, string>();
    [...new Set([...playerNameById.values()])].forEach((nm, i) => colors.set(nm, OWNER_COLORS[i % OWNER_COLORS.length]));
    setColorByOwner(colors);

    const matches = ((matchesRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
      home_team: String(m.home_team), away_team: String(m.away_team), stage: String(m.stage),
      home_score: m.home_score != null ? Number(m.home_score) : null,
      away_score: m.away_score != null ? Number(m.away_score) : null,
      result_type: m.result_type ? String(m.result_type) : null,
      winner_side: m.winner_side ? String(m.winner_side) : null,
      status: String(m.status),
    })) as MatchRow[];

    if (canBuildBracket(matches)) {
      setAvailable(true);
      setBracket(buildFullBracket(matches));
    } else {
      setAvailable(false);
    }
    setLoading(false);
  }

  function teamLabel(canon: string | null, opp: string | null) {
    if (!canon) return { name: opp ? "—" : "afventer", flag: "", owner: null as string | null, isPlaceholder: true };
    const wc = findWC2026Team(canon);
    return { name: wc?.name ?? canon, flag: wc?.flag ?? "🏳", owner: ownerByTeam.get(canon) ?? null, isPlaceholder: false };
  }

  function TeamRow({ canon, score, isWinner, settled }: { canon: string | null; score: number | null; isWinner: boolean; settled: boolean }) {
    const t = teamLabel(canon, null);
    const color = t.owner ? colorByOwner.get(t.owner) : undefined;
    return (
      <div className={cn("flex items-center gap-1.5 px-2 py-1", settled && !isWinner && "opacity-45")}>
        <span className="text-sm leading-none">{t.flag}</span>
        <span className={cn("flex-1 truncate text-xs", isWinner ? "font-bold text-white" : "text-slate-300", t.isPlaceholder && "italic text-slate-600")}>
          {t.name}
        </span>
        {t.owner && (
          <span className="shrink-0 rounded px-1 text-[0.55rem] font-semibold" style={{ backgroundColor: `${color}22`, color }}>
            {t.owner}
          </span>
        )}
        {score !== null && <span className="w-4 shrink-0 text-right text-xs font-bold tabular-nums text-slate-200">{score}</span>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <header className="border-b border-white/[0.08] bg-slate-950/40 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button type="button" onClick={() => router.push(`/game/${gameId}`)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft className="size-4" /> Spilside
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">Bracket</p>
            <p className="text-sm font-medium text-white">{gameLabel}</p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-32"><Loader2 className="size-8 animate-spin text-amber-400/60" /></div>
      ) : !available ? (
        <p className="px-4 py-24 text-center text-sm text-slate-500">
          Bracket bliver tilgængelig når gruppespillet er færdigspillet.
        </p>
      ) : (
        <main className="overflow-x-auto px-4 py-6 sm:px-6">
          <div className="mx-auto flex min-w-max gap-4">
            {ROUNDS.map((r) => {
              const ms = bracket.filter((m) => m.round === r.key);
              return (
                <div key={r.key} className="flex w-56 shrink-0 flex-col">
                  <p className="mb-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">{r.label}</p>
                  <div className="flex flex-1 flex-col justify-around gap-2">
                    {ms.map((m) => {
                      const settled = m.winner !== null;
                      return (
                        <div key={m.no} className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60 divide-y divide-white/[0.06]">
                          <TeamRow canon={m.home} score={m.homeScore} isWinner={settled && m.winner === m.home} settled={settled} />
                          <TeamRow canon={m.away} score={m.awayScore} isWinner={settled && m.winner === m.away} settled={settled} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}
    </div>
  );
}
