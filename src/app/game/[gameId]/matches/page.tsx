"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trophy, Zap } from "lucide-react";
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

// Point pr. stage for at nå den runde (gives til begge hold)
const STAGE_BONUS: Record<string, number> = {
  round_of_32:   100,
  round_of_16:   200,
  quarter_final: 400,
  semi_final:    600,
  final:         800,
};

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
};

type DayGroup = {
  dateKey: string;
  label: string;
  matches: Match[];
};

const DA_DAYS = ["Søn", "Man", "Tirs", "Ons", "Tors", "Fre", "Lør"];

function formatDayLabel(d: Date): string {
  return `${DA_DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

/** Beregn point for ét hold i én kamp (spejler recalculate_game_points-logikken) */
function calcMatchPoints(match: Match, isHome: boolean): number {
  if (match.status !== "finished" || match.homeScore === null || match.awayScore === null) return 0;

  const myScore  = isHome ? match.homeScore : match.awayScore;
  const oppScore = isHome ? match.awayScore : match.homeScore;

  let pts = 0;

  // Sejr/uafgjort/tab
  if (myScore > oppScore) {
    pts += match.resultType === "normal_time" ? 150 : 50;
  } else if (myScore === oppScore) {
    pts += 50; // uafgjort (kun gruppespil)
  }

  // Knockout-bonus: gives til begge hold blot for at spille i runden
  if (match.stage !== "group") {
    pts += STAGE_BONUS[match.stage] ?? 0;
  }

  // Turneringsvinderbonus
  if (match.stage === "final" && myScore > oppScore) {
    pts += 1000;
  }

  return pts;
}

/** High score of the day: summer point fra dagens afsluttede kampe pr. ejer */
function calcDayScores(matches: Match[]): { owner: string; pts: number }[] {
  const totals = new Map<string, number>();
  for (const m of matches) {
    if (m.status !== "finished") continue;
    const homePts = calcMatchPoints(m, true);
    const awayPts = calcMatchPoints(m, false);
    if (m.homeOwner && homePts > 0) totals.set(m.homeOwner, (totals.get(m.homeOwner) ?? 0) + homePts);
    if (m.awayOwner && awayPts > 0) totals.set(m.awayOwner, (totals.get(m.awayOwner) ?? 0) + awayPts);
  }
  return [...totals.entries()]
    .map(([owner, pts]) => ({ owner, pts }))
    .sort((a, b) => b.pts - a.pts);
}

export default function MatchesPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [gameLabel, setGameLabel] = useState("");
  const [days, setDays] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gameId) return;
    void load();
  }, [gameId]);

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
        .select("id, home_team, away_team, home_score, away_score, stage, status, match_date, winner_side, result_type")
        .eq("game_id", gameId)
        .order("match_date", { ascending: true }),
      supabase.from("game_teams").select("team_id, owner_player_id").eq("game_id", gameId),
      supabase.from("players").select("id, name").eq("game_id", gameId),
    ]);

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    setGameLabel(g?.label ?? g?.invite_code ?? "Spil");

    const playerById = new Map(
      (playersRes.data ?? []).map((p) => [String(p.id), String(p.name)])
    );

    const ownerByTeamId = new Map(
      (gtRes.data ?? [])
        .filter((r) => r.owner_player_id)
        .map((r) => [String(r.team_id), playerById.get(String(r.owner_player_id)) ?? null])
    );

    const teamIds = [...new Set((gtRes.data ?? []).map((r) => String(r.team_id)))];
    const { data: teamRows } = teamIds.length > 0
      ? await supabase.from("teams").select("id, name").in("id", teamIds)
      : { data: [] as { id: string; name: string }[] };

    const ownerByTeamName = new Map<string, string | null>();
    for (const t of teamRows ?? []) {
      const owner = ownerByTeamId.get(String(t.id)) ?? null;
      const rawName = String(t.name);
      ownerByTeamName.set(rawName.toLowerCase(), owner);
      const canonical = findWC2026Team(rawName)?.name;
      if (canonical) ownerByTeamName.set(canonical.toLowerCase(), owner);
    }

    const rawMatches = (matchesRes.data ?? []) as Record<string, unknown>[];
    const matches: Match[] = rawMatches.map((m) => {
      const rawHome = String(m.home_team);
      const rawAway = String(m.away_team);
      const homeTeam = findWC2026Team(rawHome)?.name ?? rawHome;
      const awayTeam = findWC2026Team(rawAway)?.name ?? rawAway;
      return {
        id:         String(m.id),
        homeTeam,
        awayTeam,
        homeFlag:   findWC2026Team(homeTeam)?.flag ?? "🏳",
        awayFlag:   findWC2026Team(awayTeam)?.flag ?? "🏳",
        homeOwner:  ownerByTeamName.get(homeTeam.toLowerCase()) ?? null,
        awayOwner:  ownerByTeamName.get(awayTeam.toLowerCase()) ?? null,
        matchDate:  m.match_date ? new Date(String(m.match_date)) : null,
        stage:      String(m.stage),
        status:     String(m.status),
        homeScore:  m.home_score  != null ? Number(m.home_score)  : null,
        awayScore:  m.away_score  != null ? Number(m.away_score)  : null,
        resultType: m.result_type ? String(m.result_type) : null,
        winnerSide: m.winner_side ? String(m.winner_side) : null,
      };
    });

    const byDay = new Map<string, Match[]>();
    for (const match of matches) {
      const key = match.matchDate ? match.matchDate.toLocaleDateString("sv-SE") : "ukendt";
      const arr = byDay.get(key) ?? [];
      arr.push(match);
      byDay.set(key, arr);
    }

    const dayGroups: DayGroup[] = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, ms]) => {
        const d = dateKey !== "ukendt" ? new Date(dateKey) : null;
        return {
          dateKey,
          label: d ? formatDayLabel(d) : "Ukendt dato",
          matches: ms.sort((a, b) => (a.matchDate?.getTime() ?? 0) - (b.matchDate?.getTime() ?? 0)),
        };
      });

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
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">Kampe</p>
            <p className="text-sm font-medium text-white">{gameLabel}</p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-32">
          <Loader2 className="size-8 animate-spin text-amber-400/60" />
        </div>
      ) : days.length === 0 ? (
        <p className="py-24 text-center text-sm text-slate-500">Ingen kampe fundet.</p>
      ) : (
        <>
          {/* ── Dato-faner ── */}
          <div
            ref={tabsRef}
            className="flex gap-1.5 overflow-x-auto border-b border-white/[0.07] bg-slate-950/40 px-4 py-2 scrollbar-none"
            style={{ scrollbarWidth: "none" }}
          >
            {days.map((day) => {
              const isActive  = day.dateKey === activeDay;
              const todayKey  = new Date().toLocaleDateString("sv-SE");
              const isToday   = day.dateKey === todayKey;
              const hasPassed = day.dateKey < todayKey;
              return (
                <button
                  key={day.dateKey}
                  data-day={day.dateKey}
                  type="button"
                  onClick={() => setActiveDay(day.dateKey)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive   ? "bg-amber-400/20 text-amber-200"
                    : isToday  ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                    : hasPassed? "text-slate-600 hover:text-slate-400"
                    :            "text-slate-400 hover:text-slate-200"
                  )}
                >
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
                    const finished = match.status === "finished";
                    const live     = match.status === "live";
                    const stageLabel = STAGE_LABELS[match.stage] ?? match.stage;
                    const homePts  = calcMatchPoints(match, true);
                    const awayPts  = calcMatchPoints(match, false);

                    return (
                      <div
                        key={match.id}
                        className={cn(
                          "rounded-xl border bg-slate-950/60 px-4 py-3",
                          live     ? "border-emerald-500/30 bg-emerald-950/20"
                          : finished ? "border-white/[0.06]"
                          :            "border-white/10"
                        )}
                      >
                        {/* Header: stage + tid/live-badge */}
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
                            {stageLabel}
                          </span>
                          {live && (
                            <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-emerald-400">
                              <Zap className="size-2.5" />
                              Live
                            </span>
                          )}
                          {match.matchDate && !live && (
                            <span className="ml-auto text-xs text-slate-500 tabular-nums">
                              {formatTime(match.matchDate)}
                            </span>
                          )}
                        </div>

                        {/* Holdene */}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                          {/* Hjemmehold */}
                          <div className="flex flex-col items-start gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-lg leading-none">{match.homeFlag}</span>
                              <span className={cn(
                                "text-sm font-semibold",
                                finished && match.homeScore !== null && match.awayScore !== null
                                  ? match.homeScore > match.awayScore ? "text-amber-200"
                                    : match.homeScore < match.awayScore ? "text-slate-500"
                                    : "text-slate-200"
                                  : "text-white"
                              )}>
                                {match.homeTeam}
                              </span>
                            </div>
                            {match.homeOwner ? (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-medium text-amber-300/90">
                                {match.homeOwner}
                              </span>
                            ) : (
                              <span className="text-[0.6rem] text-slate-700">Ikke købt</span>
                            )}
                            {finished && homePts > 0 && (
                              <span className="mt-0.5 text-[0.6rem] font-semibold text-emerald-400/80">
                                +{homePts} pt
                              </span>
                            )}
                          </div>

                          {/* Score / VS */}
                          <div className="flex flex-col items-center gap-0.5 min-w-[52px]">
                            {(finished || live) && match.homeScore !== null && match.awayScore !== null ? (
                              <span className={cn(
                                "text-xl font-extrabold tabular-nums",
                                live ? "text-emerald-300" : "text-white"
                              )}>
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
                              <span className={cn(
                                "text-sm font-semibold",
                                finished && match.homeScore !== null && match.awayScore !== null
                                  ? match.awayScore > match.homeScore ? "text-amber-200"
                                    : match.awayScore < match.homeScore ? "text-slate-500"
                                    : "text-slate-200"
                                  : "text-white"
                              )}>
                                {match.awayTeam}
                              </span>
                              <span className="text-lg leading-none">{match.awayFlag}</span>
                            </div>
                            {match.awayOwner ? (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-medium text-amber-300/90">
                                {match.awayOwner}
                              </span>
                            ) : (
                              <span className="text-[0.6rem] text-slate-700">Ikke købt</span>
                            )}
                            {finished && awayPts > 0 && (
                              <span className="mt-0.5 text-[0.6rem] font-semibold text-emerald-400/80">
                                +{awayPts} pt
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── High score of the day ── */}
                {hasFinishedToday && dayScores.length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 px-4 py-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Trophy className="size-4 text-amber-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                        High score of the day
                      </span>
                    </div>
                    <div className="space-y-2">
                      {dayScores.map((row, i) => (
                        <div key={row.owner} className="flex items-center gap-3">
                          <span className={cn(
                            "w-5 text-center text-xs font-bold tabular-nums",
                            i === 0 ? "text-amber-300" : "text-slate-500"
                          )}>
                            {i + 1}.
                          </span>
                          <span className={cn(
                            "flex-1 text-sm font-medium",
                            i === 0 ? "text-white" : "text-slate-400"
                          )}>
                            {row.owner}
                          </span>
                          <span className={cn(
                            "text-sm font-bold tabular-nums",
                            i === 0 ? "text-amber-300" : "text-slate-400"
                          )}>
                            +{row.pts} pt
                          </span>
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
