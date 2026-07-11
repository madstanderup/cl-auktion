"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findWC2026Team } from "@/lib/wc2026-teams";
import { canBuildBracket, buildFullBracket, type BracketMatch } from "@/lib/bracket";
import { computeGroupTables, computeGroupAdvancers, isGroupStageComplete, canonLower, type TMatch } from "@/lib/tournament";
import { clLeagueTable } from "@/lib/tournaments/cl-scoring";
import { getTournamentForGame, type TournamentConfig } from "@/lib/tournaments";
import { colorByPlayerName } from "@/lib/player-colors";
import { cn } from "@/lib/utils";

type View = "groups" | "knockout";

type TableRowView = {
  canon: string;
  name: string;
  flag: string;
  owner: string | null;
  played: number;
  pts: number;
  gd: number;
  gf: number;
  /** true/false når kvalifikationen er afgjort; null mens den er åben. */
  advanced: boolean | null;
};

export default function TournamentPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [loading, setLoading] = useState(true);
  const [gameLabel, setGameLabel] = useState("");
  const [cfg, setCfg] = useState<TournamentConfig | null>(null);
  const [bracketAvailable, setBracketAvailable] = useState(false);
  const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [ownerByTeam, setOwnerByTeam] = useState<Map<string, string>>(new Map());
  const [colorByOwner, setColorByOwner] = useState<Map<string, string>>(new Map());
  const [view, setView] = useState<View>("groups");

  useEffect(() => { if (gameId) void load(); }, [gameId]);

  async function load() {
    setLoading(true);
    const tcfg = await getTournamentForGame(gameId);
    setCfg(tcfg);
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
      if (tn && nm) owner.set((tcfg.findTeam(tn)?.name ?? tn).toLowerCase(), nm);
    }
    setOwnerByTeam(owner);

    // Låst farve pr. spiller (samme tildeling som på de andre oversigter)
    setColorByOwner(colorByPlayerName([...playerNameById.entries()].map(([id, name]) => ({ id, name }))));

    const ms = ((matchesRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
      home_team: String(m.home_team), away_team: String(m.away_team), stage: String(m.stage),
      home_score: m.home_score != null ? Number(m.home_score) : null,
      away_score: m.away_score != null ? Number(m.away_score) : null,
      result_type: m.result_type ? String(m.result_type) : null,
      winner_side: m.winner_side ? String(m.winner_side) : null,
      status: String(m.status),
    })) as TMatch[];
    setMatches(ms);

    if (tcfg.hasBracket && canBuildBracket(ms)) {
      setBracketAvailable(true);
      setBracket(buildFullBracket(ms));
      setView("knockout"); // gruppespillet er slut — slutspillet er det interessante
    } else {
      setBracketAvailable(false);
      setView("groups");
    }
    setLoading(false);
  }

  const isCl = cfg?.id === "cl2627";

  // ── VM: gruppetabeller (A-L) ─────────────────────────────────────────
  const wcGroups = useMemo(() => {
    if (!cfg || isCl) return [];
    const finished = matches.filter((m) => m.stage === "group" && m.status === "finished");
    const tables = computeGroupTables(finished);
    const advancers = isGroupStageComplete(matches) ? computeGroupAdvancers(finished) : null;
    const played = new Map<string, number>();
    for (const m of finished) {
      for (const t of [m.home_team, m.away_team]) {
        const c = canonLower(t);
        played.set(c, (played.get(c) ?? 0) + 1);
      }
    }
    const toRow = (canon: string, pts: number, gd: number, gf: number): TableRowView => {
      const cat = cfg.findTeam(canon);
      return {
        canon,
        name: cat?.name ?? canon,
        flag: cat?.flag ?? "🏳",
        owner: ownerByTeam.get(canon) ?? null,
        played: played.get(canon) ?? 0,
        pts, gd, gf,
        advanced: advancers ? advancers.has(canon) : null,
      };
    };
    const byGroup = new Map<string, TableRowView[]>();
    for (const [grp, rows] of tables) byGroup.set(grp, rows.map((r) => toRow(r.name, r.pts, r.gd, r.gf)));
    // Hold uden spillede kampe suppleres fra kataloget (0-rækker nederst)
    for (const t of cfg.teams) {
      const canon = t.name.toLowerCase();
      const arr = byGroup.get(t.group) ?? [];
      if (!arr.some((r) => r.canon === canon)) arr.push(toRow(canon, 0, 0, 0));
      byGroup.set(t.group, arr);
    }
    return [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cfg, isCl, matches, ownerByTeam]);

  // ── CL: samlet ligatabel (36 hold) ───────────────────────────────────
  const clTable = useMemo(() => {
    if (!cfg || !isCl) return [];
    const rows = clLeagueTable(matches);
    const finished = matches.filter((m) => m.stage === "league" && m.status === "finished");
    const norm = (n: string) => (cfg.findTeam(n)?.name ?? n).toLowerCase();
    const played = new Map<string, number>();
    for (const m of finished) {
      for (const t of [norm(m.home_team), norm(m.away_team)]) played.set(t, (played.get(t) ?? 0) + 1);
    }
    const out: TableRowView[] = rows.map((r) => {
      const cat = cfg.findTeam(r.name);
      return {
        canon: r.name,
        name: cat?.name ?? r.name,
        flag: cat?.flag ?? "🏳",
        owner: ownerByTeam.get(r.name) ?? null,
        played: played.get(r.name) ?? 0,
        pts: r.pts, gd: r.gd, gf: r.gf,
        advanced: null,
      };
    });
    // Hold uden spillede kampe suppleres fra kataloget
    for (const t of cfg.teams) {
      const canon = t.name.toLowerCase();
      if (!out.some((r) => r.canon === canon)) {
        out.push({ canon, name: t.name, flag: t.flag, owner: ownerByTeam.get(canon) ?? null, played: 0, pts: 0, gd: 0, gf: 0, advanced: null });
      }
    }
    return out;
  }, [cfg, isCl, matches, ownerByTeam]);

  function OwnerBadge({ owner }: { owner: string | null }) {
    if (!owner) return null;
    const color = colorByOwner.get(owner);
    return (
      <span className="ml-1.5 shrink-0 rounded px-1 text-[0.55rem] font-semibold" style={{ backgroundColor: `${color}22`, color }}>
        {owner}
      </span>
    );
  }

  function StandingsTable({ rows, zoned }: { rows: TableRowView[]; zoned: boolean }) {
    // zoned (CL): 1-8 direkte til 1/8, 9-24 playoff, 25-36 ude
    const zoneColor = (i: number) => (i < 8 ? "#34d399" : i < 24 ? "#fbbf24" : "#f87171");
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[0.55rem] uppercase tracking-wider text-slate-600">
            <th className="w-7 py-1.5 pl-3 text-left">#</th>
            <th className="py-1.5 text-left">Hold</th>
            <th className="w-8 py-1.5 text-right">K</th>
            <th className="w-9 py-1.5 text-right">+/−</th>
            <th className="w-9 py-1.5 text-right">Mål</th>
            <th className="w-9 py-1.5 pr-3 text-right">P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.canon} className={cn("border-t border-white/[0.04]", r.advanced === false && "opacity-45")}>
              <td className="py-1.5 pl-3 tabular-nums text-slate-600">
                {zoned && <span className="mr-1.5 inline-block size-1.5 rounded-full align-middle" style={{ backgroundColor: zoneColor(i) }} />}
                {i + 1}
              </td>
              <td className="py-1.5 whitespace-nowrap">
                <span className="mr-1.5">{r.flag}</span>
                <span className={cn(r.advanced ? "font-semibold text-white" : "text-slate-300")}>{r.name}</span>
                {r.advanced && <span className="ml-1 text-[0.6rem] text-emerald-400">✓</span>}
                <OwnerBadge owner={r.owner} />
              </td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">{r.played}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-400">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">{r.gf}</td>
              <td className="py-1.5 pr-3 text-right font-bold tabular-nums text-amber-200/90">{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // ── Knockout-træet (VM) ──────────────────────────────────────────────
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

  function KnockoutTree() {
    const byNo = new Map(bracket.map((m) => [m.no, m]));
    const MatchCard = (no: number) => {
      const m = byNo.get(no);
      if (!m) return null;
      const settled = m.winner !== null;
      return (
        <div key={no} className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60 divide-y divide-white/[0.06]">
          <TeamRow canon={m.home} score={m.homeScore} isWinner={settled && m.winner === m.home} settled={settled} />
          <TeamRow canon={m.away} score={m.awayScore} isWinner={settled && m.winner === m.away} settled={settled} />
        </div>
      );
    };
    const Col = (label: string, nos: number[], key: string) => (
      <div key={key} className="flex w-40 shrink-0 flex-col sm:w-44">
        <p className="mb-3 text-center text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <div className="flex flex-1 flex-col justify-around gap-2">{nos.map(MatchCard)}</div>
      </div>
    );
    const LEFT: [string, number[]][] = [
      ["1/16", [74, 77, 73, 75, 83, 84, 81, 82]],
      ["1/8", [89, 90, 93, 94]],
      ["Kvartfinale", [97, 98]],
      ["Semifinale", [101]],
    ];
    const RIGHT: [string, number[]][] = [
      ["Semifinale", [102]],
      ["Kvartfinale", [99, 100]],
      ["1/8", [91, 92, 95, 96]],
      ["1/16", [76, 78, 79, 80, 86, 88, 85, 87]],
    ];
    return (
      <div className="overflow-x-auto">
        <div className="mx-auto flex min-w-max items-stretch gap-3">
          {LEFT.map(([l, nos]) => Col(l, nos, `l-${l}`))}
          {/* Finale i midten */}
          <div className="flex w-44 shrink-0 flex-col justify-center">
            <p className="mb-3 text-center text-[0.7rem] font-bold uppercase tracking-[0.2em] text-amber-300">🏆 Finale</p>
            {MatchCard(104)}
          </div>
          {RIGHT.map(([l, nos]) => Col(l, nos, `r-${l}`))}
        </div>
      </div>
    );
  }

  const tabBase = "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors";

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <header className="border-b border-white/[0.08] bg-slate-950/40 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button type="button" onClick={() => router.push(`/game/${gameId}`)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft className="size-4" /> Spilside
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">Turnering</p>
            <p className="text-sm font-medium text-white">{gameLabel}</p>
          </div>
          {!loading && !isCl && (
            <div className="flex shrink-0 gap-1.5 rounded-xl border border-white/10 bg-slate-950/60 p-1">
              <button type="button" onClick={() => setView("groups")}
                className={cn(tabBase, view === "groups" ? "bg-amber-400/20 text-amber-200" : "text-slate-400 hover:text-slate-200")}>
                Gruppespil
              </button>
              <button type="button" onClick={() => setView("knockout")}
                className={cn(tabBase, view === "knockout" ? "bg-amber-400/20 text-amber-200" : "text-slate-400 hover:text-slate-200")}>
                Slutspil
              </button>
            </div>
          )}
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-32"><Loader2 className="size-8 animate-spin text-amber-400/60" /></div>
      ) : isCl ? (
        // CL: én samlet ligatabel (slutspils-træ bygges når playoff-seedningen kendes)
        <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
            <p className="bg-white/[0.03] px-3 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-amber-300/90">Ligafasen</p>
            <StandingsTable rows={clTable} zoned />
          </div>
          <p className="mt-3 text-center text-[0.65rem] text-slate-600">
            <span className="text-emerald-400">●</span> 1-8 direkte til 1/8-finalen · <span className="text-amber-400">●</span> 9-24 playoff · <span className="text-red-400">●</span> 25-36 ude
          </p>
        </main>
      ) : view === "groups" ? (
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {wcGroups.map(([grp, rows]) => (
              <div key={grp} className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
                <p className="bg-white/[0.03] px-3 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-amber-300/90">Gruppe {grp}</p>
                <StandingsTable rows={rows} zoned={false} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-[0.65rem] text-slate-600">
            {isGroupStageComplete(matches)
              ? <>Hold markeret med <span className="text-emerald-400">✓</span> gik videre til 1/16-finalerne (top 2 + de 8 bedste treere)</>
              : "Top 2 i hver gruppe + de 8 bedste treere går videre — markeres når gruppespillet er færdigt"}
          </p>
        </main>
      ) : bracketAvailable ? (
        <main className="px-4 py-6 sm:px-6">
          <KnockoutTree />
        </main>
      ) : (
        <p className="px-4 py-24 text-center text-sm text-slate-500">
          Slutspillet vises når gruppespillet er færdigspillet — indtil da kan du følge gruppestillingerne.
        </p>
      )}
    </div>
  );
}
