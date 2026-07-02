"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, RefreshCw, Share2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findWC2026Team } from "@/lib/wc2026-teams";
import { groupQualBonus } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const KNOCKOUT_STAGES = [
  { key: "round_of_32",   label: "1/16" },
  { key: "round_of_16",   label: "1/8" },
  { key: "quarter_final", label: "1/4" },
  { key: "semi_final",    label: "1/2" },
  { key: "final",         label: "Finale" },
];
// Kvalifikations-bonus tildelt ved SEJR i runden (finale-sejr = mester-bonus).
const QUAL_ON_WIN: Record<string, number> = {
  round_of_32: 100, round_of_16: 200, quarter_final: 200, semi_final: 200, final: 200,
};

type MatchRow = {
  home_team: string; away_team: string; stage: string;
  home_score: number | null; away_score: number | null;
  result_type: string | null; winner_side: string | null; status: string;
  match_date: string | null;
};

type Row = {
  drawOrder: number;
  teamName: string;
  flag: string;
  owner: string | null;
  group: (number | null)[]; // 3 group matches; null = ikke spillet
  knockout: (number | null)[]; // 5 knockout-runder
  total: number;
  betaling: number;
  roi: number;
};

function wonLost(m: MatchRow, isHome: boolean): { won: boolean; lost: boolean; draw: boolean } {
  if (m.result_type === "penalties" && m.winner_side) {
    const won = (isHome && m.winner_side === "home") || (!isHome && m.winner_side === "away");
    return { won, lost: !won, draw: false };
  }
  const hs = m.home_score ?? 0, as_ = m.away_score ?? 0;
  const my = isHome ? hs : as_, op = isHome ? as_ : hs;
  return { won: my > op, lost: my < op, draw: my === op };
}

function groupMatchPoints(m: MatchRow, isHome: boolean): number {
  const { won, draw } = wonLost(m, isHome);
  return draw ? 50 : won ? 150 : 0;
}

function knockoutMatchPoints(m: MatchRow, isHome: boolean): number {
  const { won } = wonLost(m, isHome);
  const isET = m.result_type === "extra_time" || m.result_type === "penalties";
  let pts = 0;
  if (isET) { pts += 50; if (won) pts += 50; }
  else if (won) pts += 150;
  if (won) pts += QUAL_ON_WIN[m.stage] ?? 0; // kvalifikation til næste runde
  return pts;
}

export default function PointsPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [rows, setRows] = useState<Row[]>([]);
  const [gameLabel, setGameLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [shareDone, setShareDone] = useState(false);

  useEffect(() => { if (gameId) void load(); }, [gameId]);

  async function load() {
    setLoading(true);

    const [gameRes, gtRes, teamsRes, playersRes, matchesRes, bidsRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("game_teams").select("team_id, owner_player_id").eq("game_id", gameId),
      supabase.from("teams").select("id, name"),
      supabase.from("players").select("id, name").eq("game_id", gameId),
      supabase.from("wc_matches").select("home_team,away_team,stage,home_score,away_score,result_type,winner_side,status,match_date").eq("game_id", gameId),
      supabase.from("auction_room_bids").select("player_id, team_name, amount, created_at").eq("game_id", gameId),
    ]);

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    setGameLabel(g?.label ?? g?.invite_code ?? "Spil");

    const teamNameById = new Map(((teamsRes.data ?? []) as Record<string, unknown>[]).map((t) => [String(t.id), String(t.name)]));
    const playerNameById = new Map(((playersRes.data ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), String(p.name)]));

    const matches: MatchRow[] = ((matchesRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
      home_team: String(m.home_team), away_team: String(m.away_team), stage: String(m.stage),
      home_score: m.home_score != null ? Number(m.home_score) : null,
      away_score: m.away_score != null ? Number(m.away_score) : null,
      result_type: m.result_type ? String(m.result_type) : null,
      winner_side: m.winner_side ? String(m.winner_side) : null,
      status: String(m.status),
      match_date: m.match_date ? String(m.match_date) : null,
    }));

    const bids = (bidsRes.data ?? []) as { player_id: string; team_name: string; amount: number; created_at: string }[];
    // Trækningsrækkefølge: tidligste bud pr. holdnavn (katalognavn)
    const firstBidAt = new Map<string, string>();
    for (const b of bids) {
      const prev = firstBidAt.get(b.team_name);
      if (!prev || b.created_at < prev) firstBidAt.set(b.team_name, b.created_at);
    }

    const built: Row[] = [];
    for (const gt of (gtRes.data ?? []) as Record<string, unknown>[]) {
      const teamName = teamNameById.get(String(gt.team_id));
      if (!teamName) continue;
      const ownerId = gt.owner_player_id ? String(gt.owner_player_id) : null;
      const owner = ownerId ? (playerNameById.get(ownerId) ?? null) : null;
      const canon = findWC2026Team(teamName)?.name ?? teamName;

      const teamMatches = matches.filter((m) => m.home_team === canon || m.away_team === canon);

      // Gruppekampe i datorækkefølge → 3 kolonner
      const groupMs = teamMatches
        .filter((m) => m.stage === "group")
        .sort((a, b) => (a.match_date ?? "").localeCompare(b.match_date ?? ""));
      const group: (number | null)[] = [0, 1, 2].map((i) => {
        const m = groupMs[i];
        if (!m || m.status !== "finished") return null;
        return groupMatchPoints(m, m.home_team === canon);
      });
      // Kvalifikation til 1/16 (+100): tildeles efter 3. gruppekamp (når hele
      // gruppespillet er slut og holdet er gået videre)
      const qual = groupQualBonus(teamName, matches);
      if (qual > 0 && group[2] !== null) group[2] = (group[2] ?? 0) + qual;

      // Knockout-runder
      const knockout: (number | null)[] = KNOCKOUT_STAGES.map((s) => {
        const m = teamMatches.find((mm) => mm.stage === s.key);
        if (!m || m.status !== "finished") return null;
        return knockoutMatchPoints(m, m.home_team === canon);
      });

      const total = [...group, ...knockout].reduce((s: number, v) => s + (v ?? 0), 0);

      // Betaling: ejerens bud på holdet (katalognavn)
      const ownerBids = ownerId ? bids.filter((b) => b.team_name === teamName && b.player_id === ownerId) : [];
      const betaling = ownerBids.length > 0 ? Math.max(...ownerBids.map((b) => b.amount)) : 0;
      const roi = betaling > 0 ? total / betaling : 0;

      built.push({
        drawOrder: 0,
        teamName,
        flag: findWC2026Team(teamName)?.flag ?? "🏳",
        owner,
        group,
        knockout,
        total,
        betaling,
        roi,
      });
    }

    // Sortér efter trækningsrækkefølge (tidligste bud først); hold uden bud sidst
    built.sort((a, b) => {
      const ta = firstBidAt.get(a.teamName);
      const tb = firstBidAt.get(b.teamName);
      if (ta && tb) return ta.localeCompare(tb);
      if (ta) return -1;
      if (tb) return 1;
      return a.teamName.localeCompare(b.teamName, "da");
    });
    built.forEach((r, i) => { r.drawOrder = i + 1; });

    setRows(built);
    setLoading(false);
  }

  const COLS = ["1. runde", "2. runde", "3. runde", ...KNOCKOUT_STAGES.map((s) => s.label)];

  function cell(v: number | null) {
    if (v === null) return <span className="text-slate-700">·</span>;
    if (v === 0) return <span className="text-slate-600">0</span>;
    return <span className="font-semibold text-amber-200/90">{v}</span>;
  }

  // Kumulative point pr. spiller runde for runde
  const playerAgg = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.owner) continue;
    const arr = playerAgg.get(r.owner) ?? new Array(COLS.length).fill(0);
    for (let i = 0; i < COLS.length; i++) arr[i] += (i < 3 ? r.group[i] : r.knockout[i - 3]) ?? 0;
    playerAgg.set(r.owner, arr);
  }
  const series = [...playerAgg.entries()]
    .map(([name, per]) => {
      const cum: number[] = [];
      let s = 0;
      for (const v of per) { s += v; cum.push(s); }
      return { name, cum, total: s };
    })
    .sort((a, b) => b.total - a.total);
  // Sidste runde med point hos nogen (afkort den flade hale)
  let lastRound = 0;
  for (let i = 0; i < COLS.length; i++) if (series.some((s) => (s.cum[i] ?? 0) > (i > 0 ? s.cum[i - 1] ?? 0 : 0))) lastRound = i;

  const MEDALS = ["🥇", "🥈", "🥉"];
  async function shareStandings() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/s/${gameId}` : "";
    const lines = series.map((s, i) => `${MEDALS[i] ?? `${i + 1}.`} ${s.name} — ${s.total.toLocaleString("da-DK")} pt`);
    const text = `🏆 ${gameLabel} — Stilling\n\n${lines.join("\n")}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) { await navigator.share({ title: `${gameLabel} — Stilling`, text, url }); return; }
    } catch { /* annulleret */ }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareDone(true);
      setTimeout(() => setShareDone(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => router.push(`/game/${gameId}`)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="size-4" />
            Spilside
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-white">{gameLabel} — Pointoversigt</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Hold i trækningsrækkefølge · point pr. runde · avancement-bonus tilfalder det tabende hold
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
          <button
            type="button"
            onClick={() => void shareStandings()}
            disabled={loading || series.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {shareDone ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
            {shareDone ? "Kopieret" : "Del"}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-8 animate-spin text-amber-400/60" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-16">Ingen hold i dette spil.</p>
        ) : (
          <div className="space-y-6">
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-slate-950/55 shadow-xl backdrop-blur-md">
            <table className="w-full min-w-max border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="sticky left-0 z-10 bg-slate-950/95 px-3 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500 w-8">#</th>
                  <th className="sticky left-8 z-10 bg-slate-950/95 px-3 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500 min-w-[150px]">Hold</th>
                  <th className="px-3 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500 min-w-[90px]">Ejer</th>
                  {COLS.map((c) => (
                    <th key={c} className="px-3 py-3 text-center text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500 min-w-[54px]">{c}</th>
                  ))}
                  <th className="px-3 py-3 text-center text-[0.6rem] font-bold uppercase tracking-wider text-amber-400/90 min-w-[60px]">Total</th>
                  <th className="px-3 py-3 text-center text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500 min-w-[60px]">Betaling</th>
                  <th className="px-3 py-3 text-center text-[0.6rem] font-semibold uppercase tracking-wider text-emerald-400/80 min-w-[54px]">ROI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.teamName} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="sticky left-0 z-10 bg-slate-950/95 px-3 py-2.5 text-slate-600 tabular-nums">{r.drawOrder}</td>
                    <td className="sticky left-8 z-10 bg-slate-950/95 px-3 py-2.5 font-medium text-slate-200 whitespace-nowrap">
                      <span className="mr-1.5">{r.flag}</span>{r.teamName}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-400">{r.owner ?? <span className="text-slate-700">—</span>}</td>
                    {r.group.map((v, i) => <td key={`g${i}`} className="px-3 py-2.5 text-center tabular-nums">{cell(v)}</td>)}
                    {r.knockout.map((v, i) => <td key={`k${i}`} className="px-3 py-2.5 text-center tabular-nums">{cell(v)}</td>)}
                    <td className="px-3 py-2.5 text-center font-bold tabular-nums text-amber-300">{r.total.toLocaleString("da-DK")}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-400">{r.betaling > 0 ? r.betaling.toLocaleString("da-DK") : <span className="text-slate-700">—</span>}</td>
                    <td className={cn("px-3 py-2.5 text-center font-semibold tabular-nums", r.betaling > 0 ? "text-emerald-300/90" : "text-slate-700")}>
                      {r.betaling > 0 ? r.roi.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pointudvikling runde for runde */}
          {series.length > 0 && lastRound >= 1 && (() => {
            const COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f87171", "#a78bfa", "#fb923c"];
            const labels = COLS.slice(0, lastRound + 1);
            const yMax = Math.max(1, ...series.map((s) => s.cum[lastRound] ?? 0));
            const W = 760, H = 280, padL = 44, padR = 12, padT = 14, padB = 30;
            const plotW = W - padL - padR, plotH = H - padT - padB;
            const x = (i: number) => padL + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
            const y = (v: number) => padT + (1 - v / yMax) * plotH;
            const gridVals = [0, 0.25, 0.5, 0.75, 1].map((g) => Math.round(g * yMax));
            return (
              <div className="rounded-2xl border border-white/[0.08] bg-slate-950/55 p-5 shadow-xl backdrop-blur-md">
                <p className="mb-4 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-blue-300/80">📈 Pointudvikling</p>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 300 }}>
                  {gridVals.map((gv, gi) => (
                    <g key={gi}>
                      <line x1={padL} y1={y(gv)} x2={W - padR} y2={y(gv)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                      <text x={padL - 6} y={y(gv) + 3} textAnchor="end" fontSize={10} fill="#64748b">{gv.toLocaleString("da-DK")}</text>
                    </g>
                  ))}
                  {labels.map((lab, i) => (
                    <text key={i} x={x(i)} y={H - 9} textAnchor="middle" fontSize={9} fill="#64748b">{lab}</text>
                  ))}
                  {series.map((s, idx) => {
                    const color = COLORS[idx % COLORS.length];
                    const path = labels.map((_, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(s.cum[i] ?? 0).toFixed(1)}`).join(" ");
                    return (
                      <g key={s.name}>
                        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                        {labels.map((_, i) => <circle key={i} cx={x(i)} cy={y(s.cum[i] ?? 0)} r={2.5} fill={color} />)}
                      </g>
                    );
                  })}
                </svg>
                <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                  {series.map((s, idx) => (
                    <span key={s.name} className="flex items-center gap-1.5 text-xs text-slate-300">
                      <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      {s.name} <span className="tabular-nums text-slate-500">{s.total.toLocaleString("da-DK")}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-center text-[0.65rem] text-slate-600">Kumulative point pr. spiller runde for runde</p>
              </div>
            );
          })()}
          </div>
        )}
      </div>
    </div>
  );
}
