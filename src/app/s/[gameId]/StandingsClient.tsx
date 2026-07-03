"use client";

import { useEffect, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { type ScoreMatch } from "@/lib/scoring";
import { getTournamentForGame, calcPointsForTournament, matchPointsForTournament } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

type MatchRow = ScoreMatch & { match_date: string | null };

type Standing = { name: string; points: number; teams: number };
type ResultLine = { home: string; away: string; homeFlag: string; awayFlag: string; hs: number; as: number; tag: string };

const MEDALS = ["🥇", "🥈", "🥉"];

export default function StandingsClient({ gameId }: { gameId: string }) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [label, setLabel] = useState("");
  const [standings, setStandings] = useState<Standing[]>([]);
  const [dayLabel, setDayLabel] = useState<string | null>(null);
  const [results, setResults] = useState<ResultLine[]>([]);
  const [topScorer, setTopScorer] = useState<{ name: string; pts: number } | null>(null);

  useEffect(() => { if (gameId) void load(); }, [gameId]);

  async function load() {
    setLoading(true);
    const cfg = await getTournamentForGame(gameId);
    const findTeam = cfg.findTeam;
    const [gameRes, playersRes, gtRes, teamsRes, matchesRes] = await Promise.all([
      supabase.from("games").select("label, invite_code").eq("id", gameId).maybeSingle(),
      supabase.from("players").select("id, name").eq("game_id", gameId),
      supabase.from("game_teams").select("team_id, owner_player_id").eq("game_id", gameId).not("owner_player_id", "is", null),
      supabase.from("teams").select("id, name"),
      supabase.from("wc_matches").select("home_team,away_team,stage,home_score,away_score,result_type,winner_side,status,match_date").eq("game_id", gameId),
    ]);

    const g = gameRes.data as { label?: string | null; invite_code?: string } | null;
    if (!g) { setNotFound(true); setLoading(false); return; }
    setLabel(g.label ?? g.invite_code ?? "Spil");

    const playerNameById = new Map(((playersRes.data ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), String(p.name)]));
    const teamNameById = new Map(((teamsRes.data ?? []) as Record<string, unknown>[]).map((t) => [String(t.id), String(t.name)]));

    const matches: MatchRow[] = ((matchesRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
      home_team: String(m.home_team), away_team: String(m.away_team), stage: String(m.stage),
      home_score: m.home_score != null ? Number(m.home_score) : null,
      away_score: m.away_score != null ? Number(m.away_score) : null,
      result_type: m.result_type ? String(m.result_type) : null,
      winner_side: m.winner_side ? String(m.winner_side) : null,
      status: String(m.status),
      match_date: m.match_date ? String(m.match_date) : null,
    }));

    // Point + holdantal pr. spiller, og normaliseret holdnavn → ejernavn
    const pointsByPlayer = new Map<string, number>();
    const teamsByPlayer = new Map<string, number>();
    const ownerByTeam = new Map<string, string>();
    for (const gt of (gtRes.data ?? []) as Record<string, unknown>[]) {
      const pid = String(gt.owner_player_id);
      const tname = teamNameById.get(String(gt.team_id));
      if (!tname) continue;
      pointsByPlayer.set(pid, (pointsByPlayer.get(pid) ?? 0) + calcPointsForTournament(cfg, tname, matches));
      teamsByPlayer.set(pid, (teamsByPlayer.get(pid) ?? 0) + 1);
      const canon = (findTeam(tname)?.name ?? tname).toLowerCase();
      const owner = playerNameById.get(pid);
      if (owner) ownerByTeam.set(canon, owner);
    }

    const standingsList: Standing[] = [...playerNameById.entries()]
      .map(([pid, name]) => ({ name, points: pointsByPlayer.get(pid) ?? 0, teams: teamsByPlayer.get(pid) ?? 0 }))
      .sort((a, b) => b.points - a.points);
    setStandings(standingsList);

    // Seneste kampdag
    const finished = matches.filter((m) => m.status === "finished" && m.match_date);
    if (finished.length > 0) {
      const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");
      const latestKey = finished.map((m) => dayKey(m.match_date as string)).sort().at(-1)!;
      const dayMatches = finished.filter((m) => dayKey(m.match_date as string) === latestKey);

      const flag = (n: string) => findTeam(n)?.flag ?? "🏳";
      setResults(dayMatches.map((m) => ({
        home: m.home_team, away: m.away_team, homeFlag: flag(m.home_team), awayFlag: flag(m.away_team),
        hs: m.home_score ?? 0, as: m.away_score ?? 0,
        tag: m.result_type === "penalties" ? "e.s." : m.result_type === "extra_time" ? "e.f." : "",
      })));

      const dayPts = new Map<string, number>();
      for (const m of dayMatches) {
        const hOwner = ownerByTeam.get((findTeam(m.home_team)?.name ?? m.home_team).toLowerCase());
        const aOwner = ownerByTeam.get((findTeam(m.away_team)?.name ?? m.away_team).toLowerCase());
        const hp = matchPointsForTournament(cfg, m, true, matches), ap = matchPointsForTournament(cfg, m, false, matches);
        if (hOwner && hp > 0) dayPts.set(hOwner, (dayPts.get(hOwner) ?? 0) + hp);
        if (aOwner && ap > 0) dayPts.set(aOwner, (dayPts.get(aOwner) ?? 0) + ap);
      }
      const top = [...dayPts.entries()].sort((a, b) => b[1] - a[1])[0];
      setTopScorer(top ? { name: top[0], pts: top[1] } : null);
      setDayLabel(new Date(latestKey).toLocaleDateString("da-DK", { day: "numeric", month: "short" }));
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_100%_50%_at_50%_0%,rgba(30,64,175,0.22),transparent_60%)]" />
      <main className="relative mx-auto max-w-md px-4 py-10">
        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="size-8 animate-spin text-amber-400/60" /></div>
        ) : notFound ? (
          <p className="py-32 text-center text-sm text-slate-500">Spillet blev ikke fundet.</p>
        ) : (
          <>
            <div className="mb-6 text-center">
              <div className="mb-2 flex items-center justify-center gap-2">
                <Trophy className="size-5 text-amber-300" />
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-slate-400">Stilling</span>
              </div>
              <h1 className="text-2xl font-extrabold text-white">{label}</h1>
            </div>

            {/* Rangliste */}
            <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl">
              {standings.map((s, i) => (
                <li key={s.name} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="w-7 shrink-0 text-center text-lg">{MEDALS[i] ?? <span className="text-sm font-mono text-slate-600">{i + 1}</span>}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-semibold", i === 0 ? "text-amber-200" : "text-white")}>{s.name}</p>
                    <p className="text-[0.65rem] text-slate-500">{s.teams} hold</p>
                  </div>
                  <span className="shrink-0 text-lg font-extrabold tabular-nums text-amber-300">{s.points.toLocaleString("da-DK")}</span>
                  <span className="text-[0.6rem] text-slate-500">pt</span>
                </li>
              ))}
            </ul>

            {/* Seneste resultater */}
            {results.length > 0 && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-4 shadow-xl">
                <p className="mb-3 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
                  ⚽ Kampe {dayLabel}
                </p>
                <div className="space-y-1.5">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate text-right text-slate-300">{r.home} {r.homeFlag}</span>
                      <span className="shrink-0 rounded bg-white/[0.06] px-2 py-0.5 font-bold tabular-nums text-white">{r.hs}–{r.as}</span>
                      <span className="flex-1 truncate text-slate-300">{r.awayFlag} {r.away}</span>
                      {r.tag && <span className="shrink-0 text-[0.55rem] uppercase text-slate-600">{r.tag}</span>}
                    </div>
                  ))}
                </div>
                {topScorer && (
                  <p className="mt-3 border-t border-white/[0.06] pt-3 text-center text-sm">
                    🔥 Dagens topscorer: <span className="font-semibold text-amber-200">{topScorer.name}</span>
                    <span className="ml-1 font-bold tabular-nums text-amber-300">+{topScorer.pts.toLocaleString("da-DK")} pt</span>
                  </p>
                )}
              </div>
            )}

            <p className="mt-8 text-center text-[0.65rem] text-slate-600">VM 2026 Auktion</p>
          </>
        )}
      </main>
    </div>
  );
}
