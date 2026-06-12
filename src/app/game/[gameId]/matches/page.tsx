"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MapPin, Trophy, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findWC2026Team } from "@/lib/wc2026-teams";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  group:         "Gruppe",
  round_of_32:   "1/16-finale",
  round_of_16:   "1/8-finale",
  quarter_final: "Kvartfinale",
  semi_final:    "Semifinale",
  final:         "Finale",
};

const STAGE_BONUS: Record<string, number> = {
  round_of_32:   100,
  round_of_16:   200,
  quarter_final: 400,
  semi_final:    600,
  final:         800,
};

type Goal = { minute: number; team: "home" | "away"; scorer: string };
type Card = { minute: number; team: "home" | "away"; player: string; color: "yellow" | "red"; addedMinute?: number };
type LineupPlayer = { player: string; number: number; position: string; starter: boolean; captain?: boolean };
type Lineups = { home: LineupPlayer[]; away: LineupPlayer[] };
type Substitution = { minute: number; team: "home" | "away"; on: string; off: string };
type Managers = { home: string; away: string };

type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  homeOwner: string | null;
  awayOwner: string | null;
  matchDate: Date | null;
  stage: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  resultType: string | null;
  winnerSide: string | null;
  goals: Goal[] | null;
  cards: Card[] | null;
  lineups: Lineups | null;
  substitutions: Substitution[] | null;
  managers: Managers | null;
  stadium: string | null;
  city: string | null;
};

type DayGroup = { dateKey: string; label: string; matches: Match[] };

const DA_DAYS = ["Søn", "Man", "Tirs", "Ons", "Tors", "Fre", "Lør"];
function formatDayLabel(d: Date) { return `${DA_DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`; }
function formatTime(d: Date) { return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }); }

function calcMatchPoints(match: Match, isHome: boolean): number {
  if (match.status !== "finished" || match.homeScore === null || match.awayScore === null) return 0;
  const myScore  = isHome ? match.homeScore : match.awayScore;
  const oppScore = isHome ? match.awayScore : match.homeScore;
  let pts = 0;
  if (myScore > oppScore) pts += match.resultType === "normal_time" ? 150 : 50;
  else if (myScore === oppScore) pts += 50;
  if (match.stage !== "group") pts += STAGE_BONUS[match.stage] ?? 0;
  if (match.stage === "final" && myScore > oppScore) pts += 1000;
  return pts;
}

function calcDayScores(matches: Match[]): { owner: string; pts: number }[] {
  const totals = new Map<string, number>();
  for (const m of matches) {
    if (m.status !== "finished") continue;
    const hp = calcMatchPoints(m, true), ap = calcMatchPoints(m, false);
    if (m.homeOwner && hp > 0) totals.set(m.homeOwner, (totals.get(m.homeOwner) ?? 0) + hp);
    if (m.awayOwner && ap > 0) totals.set(m.awayOwner, (totals.get(m.awayOwner) ?? 0) + ap);
  }
  return [...totals.entries()].map(([owner, pts]) => ({ owner, pts })).sort((a, b) => b.pts - a.pts);
}

function LineupSide({ match, side }: { match: Match; side: "home" | "away" }) {
  const lineup = match.lineups?.[side] ?? [];
  const starters = lineup.filter((p) => p.starter);
  const bench = lineup.filter((p) => !p.starter);
  const manager = match.managers?.[side];
  const teamName = side === "home" ? match.homeTeam : match.awayTeam;
  const flag = side === "home" ? match.homeFlag : match.awayFlag;

  // Deduplikér på "ind"-spillerens navn — API sender dubletter
  const rawSubs = (match.substitutions ?? []).filter((s) => s.team === side);
  const seenOn = new Set<string>();
  const subs = rawSubs.filter((s) => { if (seenOn.has(s.on)) return false; seenOn.add(s.on); return true; });

  // Lookups
  const subByPlayerName = new Map(subs.map((s) => [s.on, s]));
  const subbedOffNames = new Set(subs.map((s) => s.off));

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">
        {flag} {teamName}
      </p>
      {manager && (
        <p className="text-[0.65rem] text-slate-500 mb-2">
          🧑‍💼 <span className="text-slate-400">{manager}</span>
        </p>
      )}

      {/* Startopstilling — udgåede spillere markeres rødt */}
      {starters.length > 0 && (
        <div className="space-y-0.5 mb-2">
          {starters.map((p, i) => {
            const wasSubbed = subbedOffNames.has(p.player);
            const subMinute = wasSubbed ? subs.find((s) => s.off === p.player)?.minute : undefined;
            return (
              <div key={i} className={cn(
                "flex items-center gap-1.5 text-xs rounded px-0.5 -mx-0.5",
                wasSubbed && "bg-red-950/40"
              )}>
                <span className={cn("w-5 shrink-0 text-right tabular-nums text-[0.6rem]", wasSubbed ? "text-red-600" : "text-slate-600")}>
                  {p.number}
                </span>
                <span className={cn("w-6 shrink-0 text-[0.55rem] font-bold uppercase", wasSubbed ? "text-red-800" : "text-slate-600")}>
                  {p.position}
                </span>
                <span className={cn("flex-1 truncate text-[0.7rem]", wasSubbed ? "text-red-400" : "text-slate-300")}>
                  {p.player}{p.captain ? " ©" : ""}
                </span>
                {wasSubbed && subMinute != null && (
                  <span className="shrink-0 text-[0.6rem] tabular-nums text-red-700">
                    ↓ {subMinute}&apos;
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bænk — indskiftede øverst (grøn), uudnyttede nedenunder (grå) */}
      {bench.length > 0 && (
        <div className="border-t border-white/[0.06] pt-1.5 space-y-0.5">
          <p className="text-[0.55rem] uppercase tracking-wider text-slate-600 mb-1">Bænk</p>
          {[...bench].sort((a, b) => {
            const aSub = subByPlayerName.has(a.player) ? 0 : 1;
            const bSub = subByPlayerName.has(b.player) ? 0 : 1;
            return aSub - bSub;
          }).map((p, i, arr) => {
            const sub = subByPlayerName.get(p.player);
            // Separator mellem indskiftede og uudnyttede
            const prevHasSub = i > 0 && subByPlayerName.has(arr[i - 1].player);
            const showDivider = !sub && prevHasSub;
            return (
              <div key={i}>
                {showDivider && <div className="my-1 border-t border-white/[0.04]" />}
                <div className={cn(
                  "flex items-center gap-1.5 text-xs rounded px-0.5 -mx-0.5",
                  sub && "bg-emerald-950/50"
                )}>
                  <span className={cn("w-5 shrink-0 text-right tabular-nums text-[0.6rem]", sub ? "text-emerald-500" : "text-slate-600")}>
                    {p.number}
                  </span>
                  <span className={cn("w-6 shrink-0 text-[0.55rem] font-bold uppercase", sub ? "text-emerald-700" : "text-slate-600")}>
                    {p.position}
                  </span>
                  <span className={cn("flex-1 truncate text-[0.7rem]", sub ? "text-emerald-300 font-medium" : "text-slate-400")}>
                    {sub && <span className="mr-0.5 text-emerald-500">↑</span>}
                    {p.player}
                  </span>
                  {sub && (
                    <span className="shrink-0 text-[0.6rem] tabular-nums text-emerald-700">
                      {sub.minute}&apos;
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {starters.length === 0 && <p className="text-xs text-slate-600">Ikke tilgængelig</p>}
    </div>
  );
}

export default function MatchesPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [gameLabel, setGameLabel] = useState("");
  const [days, setDays] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [openLineupMatchId, setOpenLineupMatchId] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (gameId) void load(); }, [gameId]);

  useEffect(() => {
    if (!activeDay || !tabsRef.current) return;
    const el = tabsRef.current.querySelector(`[data-day="${activeDay}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeDay]);

  async function load() {
    setLoading(true);
    const [gameRes, matchesRes, gtRes, playersRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("wc_matches")
        .select("id,home_team,away_team,home_score,away_score,stage,status,match_date,winner_side,result_type,goals,cards,lineups,substitutions,managers,stadium,city")
        .eq("game_id", gameId)
        .order("match_date", { ascending: true }),
      supabase.from("game_teams").select("team_id, owner_player_id").eq("game_id", gameId),
      supabase.from("players").select("id, name").eq("game_id", gameId),
    ]);

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    setGameLabel(g?.label ?? g?.invite_code ?? "Spil");

    const playerById = new Map((playersRes.data ?? []).map((p) => [String(p.id), String(p.name)]));
    const ownerByTeamId = new Map(
      (gtRes.data ?? []).filter((r) => r.owner_player_id)
        .map((r) => [String(r.team_id), playerById.get(String(r.owner_player_id)) ?? null])
    );
    const teamIds = [...new Set((gtRes.data ?? []).map((r) => String(r.team_id)))];
    const { data: teamRows } = teamIds.length > 0
      ? await supabase.from("teams").select("id, name").in("id", teamIds)
      : { data: [] as { id: string; name: string }[] };

    const ownerByTeamName = new Map<string, string | null>();
    for (const t of teamRows ?? []) {
      const owner = ownerByTeamId.get(String(t.id)) ?? null;
      const raw = String(t.name);
      ownerByTeamName.set(raw.toLowerCase(), owner);
      const canon = findWC2026Team(raw)?.name;
      if (canon) ownerByTeamName.set(canon.toLowerCase(), owner);
    }

    const matches: Match[] = ((matchesRes.data ?? []) as Record<string, unknown>[]).map((m) => {
      const rawHome = String(m.home_team), rawAway = String(m.away_team);
      const homeTeam = findWC2026Team(rawHome)?.name ?? rawHome;
      const awayTeam = findWC2026Team(rawAway)?.name ?? rawAway;
      return {
        id:            String(m.id),
        homeTeam, awayTeam,
        homeFlag:      findWC2026Team(homeTeam)?.flag ?? "🏳",
        awayFlag:      findWC2026Team(awayTeam)?.flag ?? "🏳",
        homeOwner:     ownerByTeamName.get(homeTeam.toLowerCase()) ?? null,
        awayOwner:     ownerByTeamName.get(awayTeam.toLowerCase()) ?? null,
        matchDate:     m.match_date ? new Date(String(m.match_date)) : null,
        stage:         String(m.stage),
        status:        String(m.status),
        homeScore:     m.home_score  != null ? Number(m.home_score)  : null,
        awayScore:     m.away_score  != null ? Number(m.away_score)  : null,
        resultType:    m.result_type ? String(m.result_type) : null,
        winnerSide:    m.winner_side ? String(m.winner_side) : null,
        goals:         (m.goals as Goal[] | null) ?? null,
        cards:         (m.cards as Card[] | null) ?? null,
        lineups:       (m.lineups as Lineups | null) ?? null,
        substitutions: (m.substitutions as Substitution[] | null) ?? null,
        managers:      (m.managers as Managers | null) ?? null,
        stadium:       m.stadium ? String(m.stadium) : null,
        city:          m.city ? String(m.city) : null,
      };
    });

    const byDay = new Map<string, Match[]>();
    for (const match of matches) {
      const key = match.matchDate ? match.matchDate.toLocaleDateString("sv-SE") : "ukendt";
      const arr = byDay.get(key) ?? []; arr.push(match); byDay.set(key, arr);
    }
    const dayGroups: DayGroup[] = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, ms]) => ({
        dateKey,
        label: dateKey !== "ukendt" ? formatDayLabel(new Date(dateKey)) : "Ukendt dato",
        matches: ms.sort((a, b) => (a.matchDate?.getTime() ?? 0) - (b.matchDate?.getTime() ?? 0)),
      }));

    setDays(dayGroups);
    const todayKey = new Date().toLocaleDateString("sv-SE");
    const future = dayGroups.find((d) => d.dateKey >= todayKey);
    setActiveDay(future?.dateKey ?? dayGroups[0]?.dateKey ?? null);
    setLoading(false);
  }

  const activeDayGroup = days.find((d) => d.dateKey === activeDay);
  const dayScores = activeDayGroup ? calcDayScores(activeDayGroup.matches) : [];
  const hasFinishedToday = activeDayGroup?.matches.some((m) => m.status === "finished") ?? false;

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <header className="border-b border-white/[0.08] bg-slate-950/40 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <button type="button" onClick={() => router.push(`/game/${gameId}`)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft className="size-4" /> Spilside
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">Kampe</p>
            <p className="text-sm font-medium text-white">{gameLabel}</p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-32"><Loader2 className="size-8 animate-spin text-amber-400/60" /></div>
      ) : days.length === 0 ? (
        <p className="py-24 text-center text-sm text-slate-500">Ingen kampe fundet.</p>
      ) : (
        <>
          {/* Dato-faner */}
          <div ref={tabsRef} className="flex gap-1.5 overflow-x-auto border-b border-white/[0.07] bg-slate-950/40 px-4 py-2 scrollbar-none" style={{ scrollbarWidth: "none" }}>
            {days.map((day) => {
              const isActive = day.dateKey === activeDay;
              const todayKey = new Date().toLocaleDateString("sv-SE");
              const isToday = day.dateKey === todayKey;
              const hasPassed = day.dateKey < todayKey;
              return (
                <button key={day.dateKey} data-day={day.dateKey} type="button" onClick={() => setActiveDay(day.dateKey)}
                  className={cn("shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive ? "bg-amber-400/20 text-amber-200"
                    : isToday ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                    : hasPassed ? "text-slate-600 hover:text-slate-400"
                    : "text-slate-400 hover:text-slate-200")}>
                  {day.label}
                  {isToday && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-blue-400 align-middle" />}
                </button>
              );
            })}
          </div>

          <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-6">
            {activeDayGroup && (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-white">{activeDayGroup.label}</h2>
                  <span className="text-xs text-slate-500">{activeDayGroup.matches.length} kampe</span>
                </div>

                <div className="space-y-2">
                  {activeDayGroup.matches.map((match) => {
                    const finished   = match.status === "finished";
                    const live       = match.status === "live";
                    const stageLabel = STAGE_LABELS[match.stage] ?? match.stage;
                    const homePts    = calcMatchPoints(match, true);
                    const awayPts    = calcMatchPoints(match, false);
                    const homeGoals  = (match.goals ?? []).filter((g) => g.team === "home");
                    const awayGoals  = (match.goals ?? []).filter((g) => g.team === "away");
                    const homeRed    = (match.cards ?? []).filter((c) => c.team === "home" && c.color === "red");
                    const awayRed    = (match.cards ?? []).filter((c) => c.team === "away" && c.color === "red");
                    const hasEvents  = homeGoals.length > 0 || awayGoals.length > 0 || homeRed.length > 0 || awayRed.length > 0;
                    const hasLineup  = !!(match.lineups?.home?.length || match.lineups?.away?.length || match.managers);
                    const lineupOpen = openLineupMatchId === match.id;

                    return (
                      <div key={match.id} className={cn(
                        "rounded-xl border bg-slate-950/60 px-4 py-3",
                        live ? "border-emerald-500/30 bg-emerald-950/20" : finished ? "border-white/[0.06]" : "border-white/10"
                      )}>
                        {/* Header: stage + stadion + tid */}
                        <div className="mb-2 flex items-center gap-2 flex-wrap">
                          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">{stageLabel}</span>
                          {live && (
                            <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-emerald-400">
                              <Zap className="size-2.5" /> Live
                            </span>
                          )}
                          {match.stadium && (
                            <span className="flex items-center gap-1 text-[0.6rem] text-slate-600">
                              <MapPin className="size-2.5" />
                              {match.stadium}{match.city ? `, ${match.city}` : ""}
                            </span>
                          )}
                          {match.matchDate && !live && (
                            <span className="ml-auto text-xs text-slate-500 tabular-nums">{formatTime(match.matchDate)}</span>
                          )}
                        </div>

                        {/* Holdene */}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                          {/* Hjemmehold */}
                          <div className="flex flex-col items-start gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-lg leading-none">{match.homeFlag}</span>
                              <button type="button"
                                onClick={() => hasLineup && setOpenLineupMatchId(lineupOpen ? null : match.id)}
                                className={cn("text-sm font-semibold text-left transition-colors",
                                  finished && match.homeScore !== null && match.awayScore !== null
                                    ? match.homeScore > match.awayScore ? "text-amber-200"
                                      : match.homeScore < match.awayScore ? "text-slate-500"
                                      : "text-slate-200"
                                    : "text-white",
                                  hasLineup && "cursor-pointer hover:underline underline-offset-2 decoration-dotted")}>
                                {match.homeTeam}
                              </button>
                            </div>
                            {match.homeOwner
                              ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-medium text-amber-300/90">{match.homeOwner}</span>
                              : <span className="text-[0.6rem] text-slate-700">Ikke købt</span>}
                            {finished && homePts > 0 && <span className="mt-0.5 text-[0.6rem] font-semibold text-emerald-400/80">+{homePts} pt</span>}
                          </div>

                          {/* Score */}
                          <div className="flex flex-col items-center gap-0.5 min-w-[52px]">
                            {(finished || live) && match.homeScore !== null && match.awayScore !== null ? (
                              <span className={cn("text-xl font-extrabold tabular-nums", live ? "text-emerald-300" : "text-white")}>
                                {match.homeScore}–{match.awayScore}
                              </span>
                            ) : (
                              <span className="text-base font-bold text-slate-600">vs</span>
                            )}
                            {finished && (
                              <span className="text-[0.55rem] uppercase tracking-widest text-slate-600">
                                {match.resultType === "penalties" ? "Straffe" : match.resultType === "extra_time" ? "Forl." : "Slut"}
                              </span>
                            )}
                          </div>

                          {/* Udehold */}
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <button type="button"
                                onClick={() => hasLineup && setOpenLineupMatchId(lineupOpen ? null : match.id)}
                                className={cn("text-sm font-semibold text-right transition-colors",
                                  finished && match.homeScore !== null && match.awayScore !== null
                                    ? match.awayScore > match.homeScore ? "text-amber-200"
                                      : match.awayScore < match.homeScore ? "text-slate-500"
                                      : "text-slate-200"
                                    : "text-white",
                                  hasLineup && "cursor-pointer hover:underline underline-offset-2 decoration-dotted")}>
                                {match.awayTeam}
                              </button>
                              <span className="text-lg leading-none">{match.awayFlag}</span>
                            </div>
                            {match.awayOwner
                              ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-medium text-amber-300/90">{match.awayOwner}</span>
                              : <span className="text-[0.6rem] text-slate-700">Ikke købt</span>}
                            {finished && awayPts > 0 && <span className="mt-0.5 text-[0.6rem] font-semibold text-emerald-400/80">+{awayPts} pt</span>}
                          </div>
                        </div>

                        {/* Målscorere + røde kort */}
                        {hasEvents && (
                          <div className="mt-2.5 border-t border-white/[0.06] pt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
                            <div className="space-y-0.5">
                              {homeGoals.map((g, i) => (
                                <p key={i} className="text-[0.65rem] text-slate-400">
                                  <span className="mr-1">⚽</span>
                                  <span className="tabular-nums text-slate-500">{g.minute}&apos;</span> {g.scorer}
                                </p>
                              ))}
                              {homeRed.map((c, i) => (
                                <p key={i} className="text-[0.65rem] text-slate-400">
                                  <span className="mr-1">🟥</span>
                                  <span className="tabular-nums text-slate-500">{c.minute}&apos;</span> {c.player}
                                </p>
                              ))}
                            </div>
                            <div className="space-y-0.5 text-right">
                              {awayGoals.map((g, i) => (
                                <p key={i} className="text-[0.65rem] text-slate-400">
                                  {g.scorer} <span className="tabular-nums text-slate-500">{g.minute}&apos;</span><span className="ml-1">⚽</span>
                                </p>
                              ))}
                              {awayRed.map((c, i) => (
                                <p key={i} className="text-[0.65rem] text-slate-400">
                                  {c.player} <span className="tabular-nums text-slate-500">{c.minute}&apos;</span><span className="ml-1">🟥</span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Opstillings-panel — begge hold side om side */}
                        {lineupOpen && hasLineup && (
                          <div className="mt-2.5 border-t border-white/[0.06] pt-3">
                            <div className="flex gap-4">
                              <LineupSide match={match} side="home" />
                              <div className="w-px bg-white/[0.06] shrink-0" />
                              <LineupSide match={match} side="away" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* High score of the day */}
                {hasFinishedToday && dayScores.length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 px-4 py-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Trophy className="size-4 text-amber-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">High score of the day</span>
                    </div>
                    <div className="space-y-2">
                      {dayScores.map((row, i) => (
                        <div key={row.owner} className="flex items-center gap-3">
                          <span className={cn("w-5 text-center text-xs font-bold tabular-nums", i === 0 ? "text-amber-300" : "text-slate-500")}>{i + 1}.</span>
                          <span className={cn("flex-1 text-sm font-medium", i === 0 ? "text-white" : "text-slate-400")}>{row.owner}</span>
                          <span className={cn("text-sm font-bold tabular-nums", i === 0 ? "text-amber-300" : "text-slate-400")}>+{row.pts} pt</span>
                          {i === 0 && <Trophy className="size-3.5 text-amber-400" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </>
      )}
    </div>
  );
}
