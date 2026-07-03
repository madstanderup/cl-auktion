"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Trophy, User } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  PLAYER_GAME_ID_KEY,
  PLAYER_ID_KEY,
} from "@/lib/player-storage";
import { supabase } from "@/lib/supabase";
import { getTournamentForGame, calcPointsForTournament, type TournamentConfig } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

type Me = {
  id: string;
  name: string;
  coins: number;
  points: number;
};

type TeamRow = { name: string; points: number };

type Row = { id: string; name: string; points: number; coins: number };

type MatchRow = {
  home_team: string;
  away_team: string;
  stage: string;
  home_score: number | null;
  away_score: number | null;
  result_type: string | null;
  winner_side: string | null;
  status: string;
};


export default function ScorePage() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameLabel, setGameLabel] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [myTeams, setMyTeams] = useState<TeamRow[]>([]);
  const [board, setBoard] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (gid: string, pid: string) => {
    setLoading(true);
    setError(null);
    const cfg: TournamentConfig = await getTournamentForGame(gid);

    const [{ data: gameRow }, { data: self, error: selfErr }, { data: gtAll }, { data: all }, { data: matchData }] =
      await Promise.all([
        supabase.from("games").select("label,invite_code").eq("id", gid).maybeSingle(),
        supabase.from("players").select("id,name,coins,game_id").eq("id", pid).maybeSingle(),
        supabase
          .from("game_teams")
          .select("team_id, owner_player_id, teams(name)")
          .eq("game_id", gid)
          .not("owner_player_id", "is", null),
        supabase
          .from("players")
          .select("id,name,coins")
          .eq("game_id", gid),
        supabase
          .from("wc_matches")
          .select("home_team,away_team,stage,home_score,away_score,result_type,winner_side,status")
          .eq("game_id", gid),
      ]);

    setLoading(false);

    if (selfErr) {
      setError(selfErr.message);
      setMe(null);
      setBoard([]);
      setMyTeams([]);
      return;
    }

    if (!self || String(self.game_id) !== gid) {
      setError("Spilleren findes ikke i dette spil. Tilmeld dig igen fra forsiden med samme kode.");
      setMe(null);
      setBoard([]);
      setMyTeams([]);
      return;
    }

    const g = gameRow as { label: string | null; invite_code: string } | null;
    setGameLabel(
      g?.label?.trim()
        ? `${g.label} (${g.invite_code})`
        : g?.invite_code
          ? `Spil ${g.invite_code}`
          : null,
    );

    const matches: MatchRow[] = (matchData ?? []).map((m: Record<string, unknown>) => ({
      home_team: String(m.home_team),
      away_team: String(m.away_team),
      stage: String(m.stage),
      home_score: m.home_score != null ? Number(m.home_score) : null,
      away_score: m.away_score != null ? Number(m.away_score) : null,
      result_type: m.result_type ? String(m.result_type) : null,
      winner_side: m.winner_side ? String(m.winner_side) : null,
      status: String(m.status),
    }));

    // Beregn point client-side (med navne-normalisering) for alle spillere
    const pointsByPlayer = new Map<string, number>();
    const myTeamRows: TeamRow[] = [];
    for (const row of gtAll ?? []) {
      const r = row as { owner_player_id?: string | null; teams?: { name?: string } | null };
      const nm = r.teams?.name;
      const oid = r.owner_player_id ? String(r.owner_player_id) : null;
      if (!nm || !oid) continue;
      const pts = calcPointsForTournament(cfg, String(nm), matches);
      pointsByPlayer.set(oid, (pointsByPlayer.get(oid) ?? 0) + pts);
      if (oid === pid) myTeamRows.push({ name: String(nm), points: pts });
    }

    setMe({
      id: String(self.id),
      name: String(self.name),
      coins: Number(self.coins),
      points: pointsByPlayer.get(pid) ?? 0,
    });

    setMyTeams(myTeamRows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "da")));

    setBoard(
      (all ?? [])
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          points: pointsByPlayer.get(String(r.id)) ?? 0,
          coins: Number(r.coins),
        }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "da")),
    );
  }, []);

  useEffect(() => {
    try {
      setGameId(localStorage.getItem(PLAYER_GAME_ID_KEY));
      setPlayerId(localStorage.getItem(PLAYER_ID_KEY));
    } catch {
      setGameId(null);
      setPlayerId(null);
    }
  }, []);

  useEffect(() => {
    if (!gameId || !playerId) {
      setLoading(false);
      return;
    }
    void load(gameId, playerId);
  }, [gameId, playerId, load]);

  useEffect(() => {
    if (!gameId) return;
    const channel = supabase
      .channel(`score-board-${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` },
        () => { if (playerId) void load(gameId, playerId); })
      .on("postgres_changes", { event: "*", schema: "public", table: "game_teams", filter: `game_id=eq.${gameId}` },
        () => { if (playerId) void load(gameId, playerId); })
      .on("postgres_changes", { event: "*", schema: "public", table: "wc_matches", filter: `game_id=eq.${gameId}` },
        () => { if (playerId) void load(gameId, playerId); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [gameId, playerId, load]);

  if (!gameId || !playerId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030711] px-6 text-slate-100">
        <Trophy className="mb-4 size-10 text-amber-300/80" aria-hidden />
        <p className="max-w-md text-center text-slate-400">
          Her vises din stilling for det spil du er tilmeldt. Brug samme browser som da du joined, eller gå til forsiden
          og tilmeld dig igen med invitationskode og navn.
        </p>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "mt-8")}>
          Til forsiden
        </Link>
      </div>
    );
  }

  if (loading && !me && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030711] text-slate-100">
        <Loader2 className="size-8 animate-spin text-amber-400/80" aria-label="Indlæser" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      <header className="border-b border-white/[0.08] bg-slate-950/40 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
              <Trophy className="size-5" aria-hidden />
            </div>
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">Stilling</p>
              <p className="text-sm font-medium text-white">{gameLabel ?? "Dit spil"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/auction" className={cn(buttonVariants({ variant: "secondary" }), "text-xs")}>
              Auktion
            </Link>
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "text-xs")}>
              Forside
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        {error ? (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
        ) : me ? (
          <>
            {/* ── Mig ── */}
            <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 shadow-xl shadow-blue-950/30">
              <div className="flex items-start gap-3">
                <User className="mt-0.5 size-5 text-slate-400" aria-hidden />
                <div>
                  <p className="text-lg font-semibold text-white">{me.name}</p>
                  <p className="mt-1 text-sm text-slate-400">Dig i dette spil</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Turneringspoint</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-amber-200">
                    {me.points.toLocaleString("da-DK")}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Mønter tilbage</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-100">
                    {me.coins.toLocaleString("da-DK")}
                  </p>
                </div>
              </div>
            </section>

            {/* ── Mine hold ── */}
            <section className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl shadow-blue-950/30">
              <div className="border-b border-white/[0.08] px-5 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Mine hold</h2>
                <p className="mt-0.5 text-xs text-slate-500">{myTeams.length} hold · sorteret efter point</p>
              </div>
              {myTeams.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500">Ingen hold endnu.</p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {myTeams.map((team) => (
                    <li key={team.name} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="text-sm font-medium text-slate-200">{team.name}</span>
                      {team.points > 0 ? (
                        <span className="tabular-nums text-sm font-semibold text-amber-200">
                          {team.points.toLocaleString("da-DK")} pt
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">0 pt</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Rangliste ── */}
            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Rangliste</h2>
              <p className="mt-1 text-xs text-slate-500">
                Opdateres live når værten registrerer kampresultater. Point beregnes automatisk ud fra dine holds præstationer.
              </p>
              <ul className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10 bg-slate-950/50">
                {board.map((row, idx) => (
                  <li
                    key={row.id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-3 text-sm",
                      row.id === me.id && "bg-amber-500/10",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-6 shrink-0 text-center font-mono text-xs text-slate-500">{idx + 1}</span>
                      <span className="truncate font-medium text-white">{row.name}</span>
                    </div>
                    <span className="shrink-0 tabular-nums font-semibold text-amber-200">
                      {row.points.toLocaleString("da-DK")} pt
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        <p className="mt-10 text-center text-xs text-slate-600">
          Gem denne side som bogmærke på den enhed du spiller fra. På sigt: login (fx e-mail) giver adgang fra alle
          enheder.
        </p>
      </main>
    </div>
  );
}
