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
import { cn } from "@/lib/utils";

type Me = {
  id: string;
  name: string;
  coins: number;
  points: number;
};

type Row = { id: string; name: string; points: number; coins: number };

export default function ScorePage() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameLabel, setGameLabel] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [myTeams, setMyTeams] = useState<string[]>([]);
  const [board, setBoard] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (gid: string, pid: string) => {
    setLoading(true);
    setError(null);

    const [{ data: gameRow }, { data: self, error: selfErr }, { data: roster }, { data: all }] =
      await Promise.all([
        supabase.from("games").select("label,invite_code").eq("id", gid).maybeSingle(),
        supabase.from("players").select("id,name,coins,points,game_id").eq("id", pid).maybeSingle(),
        supabase
          .from("game_teams")
          .select("team_id, teams(name)")
          .eq("game_id", gid)
          .eq("owner_player_id", pid),
        supabase
          .from("players")
          .select("id,name,points,coins")
          .eq("game_id", gid)
          .order("points", { ascending: false })
          .order("name", { ascending: true }),
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

    setMe({
      id: String(self.id),
      name: String(self.name),
      coins: Number(self.coins),
      points: Number(self.points),
    });

    const names: string[] = [];
    for (const row of roster ?? []) {
      const r = row as { teams?: { name?: string } | null };
      const nm = r.teams?.name;
      if (nm) names.push(String(nm));
    }
    setMyTeams(names.sort((a, b) => a.localeCompare(b, "da")));

    setBoard(
      (all ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        points: Number(r.points),
        coins: Number(r.coins),
      })),
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          if (playerId) void load(gameId, playerId);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_teams",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          if (playerId) void load(gameId, playerId);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
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
            <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 shadow-xl shadow-blue-950/30">
              <div className="flex items-start gap-3">
                <User className="mt-0.5 size-5 text-slate-400" aria-hidden />
                <div>
                  <p className="text-lg font-semibold text-white">{me.name}</p>
                  <p className="mt-1 text-sm text-slate-400">Dig i dette spil</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                <div className="col-span-2 rounded-xl border border-white/10 bg-black/30 p-4 sm:col-span-1">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Hold i truppen</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {myTeams.length ? myTeams.join(", ") : "Ingen endnu"}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Rangliste</h2>
              <p className="mt-1 text-xs text-slate-500">
                Opdateres live når værten registrerer resultater og tildeler point i databasen.
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
