"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Trophy, Users, ChevronRight } from "lucide-react";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  GAME_ADMIN_SESSION_KEY,
  PLAYER_GAME_ID_KEY,
  PLAYER_ID_KEY,
  PLAYER_NAME_KEY,
} from "@/lib/player-storage";
import { cn } from "@/lib/utils";

const STAR_POSITIONS: ReadonlyArray<{ top: string; left: string; opacity: number; size: number }> = [
  { top: "8%", left: "12%", opacity: 0.35, size: 1 },
  { top: "15%", left: "78%", opacity: 0.5, size: 2 },
  { top: "22%", left: "34%", opacity: 0.25, size: 1 },
  { top: "31%", left: "91%", opacity: 0.4, size: 1 },
  { top: "18%", left: "56%", opacity: 0.55, size: 2 },
  { top: "42%", left: "8%", opacity: 0.3, size: 1 },
  { top: "48%", left: "62%", opacity: 0.45, size: 2 },
  { top: "55%", left: "41%", opacity: 0.2, size: 1 },
  { top: "61%", left: "88%", opacity: 0.5, size: 1 },
  { top: "67%", left: "19%", opacity: 0.35, size: 2 },
  { top: "73%", left: "72%", opacity: 0.28, size: 1 },
  { top: "12%", left: "45%", opacity: 0.4, size: 1 },
  { top: "84%", left: "52%", opacity: 0.5, size: 2 },
  { top: "91%", left: "28%", opacity: 0.22, size: 1 },
  { top: "6%", left: "93%", opacity: 0.38, size: 1 },
];

type MyGame = {
  player_id: string;
  player_name: string;
  coins: number;
  points: number;
  game_id: string;
  invite_code: string;
  label: string | null;
  auction_status: string | null;
};

export default function Home() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [myGames, setMyGames] = useState<MyGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
    });
    try {
      const raw = localStorage.getItem(GAME_ADMIN_SESSION_KEY);
      if (!raw) return;
      const o = JSON.parse(raw) as { inviteCode?: string };
      if (typeof o.inviteCode === "string" && o.inviteCode) {
        setInviteCode((prev) => (prev.trim() ? prev : o.inviteCode as string));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    void loadMyGames(userId);
  }, [userId]);

  async function loadMyGames(uid: string) {
    setGamesLoading(true);
    try {
      const supabase = createClient();
      // Fetch player rows for this user
      const { data: playerRows } = await supabase
        .from("players")
        .select("id, name, coins, points, game_id")
        .eq("user_id", uid);

      if (!playerRows || playerRows.length === 0) { setMyGames([]); return; }

      const gameIds = playerRows.map((p) => String(p.game_id));

      // Fetch game info and auction states in parallel
      const [gamesRes, auctionRes] = await Promise.all([
        supabase.from("games").select("id, invite_code, label").in("id", gameIds),
        supabase.from("auction_state").select("game_id, status").in("game_id", gameIds),
      ]);

      const gameMap = new Map<string, { invite_code: string; label: string | null }>();
      for (const g of gamesRes.data ?? []) {
        gameMap.set(String(g.id), { invite_code: g.invite_code as string, label: g.label as string | null });
      }

      const auctionMap = new Map<string, string>();
      for (const a of auctionRes.data ?? []) {
        auctionMap.set(String(a.game_id), a.status as string);
      }

      const games: MyGame[] = playerRows.map((p) => {
        const gid = String(p.game_id);
        const gInfo = gameMap.get(gid);
        return {
          player_id: String(p.id),
          player_name: p.name as string,
          coins: p.coins as number,
          points: p.points as number,
          game_id: gid,
          invite_code: gInfo?.invite_code ?? "",
          label: gInfo?.label ?? null,
          auction_status: auctionMap.get(gid) ?? null,
        };
      });

      setMyGames(games);
    } finally {
      setGamesLoading(false);
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function handleEnterGame(game: MyGame) {
    try {
      localStorage.setItem(PLAYER_ID_KEY, game.player_id);
      localStorage.setItem(PLAYER_NAME_KEY, game.player_name);
      localStorage.setItem(PLAYER_GAME_ID_KEY, game.game_id);
    } catch { /* ignore */ }
    const isActive = game.auction_status && game.auction_status !== "finished";
    if (isActive) {
      router.push("/auction");
    } else {
      router.push(`/game/${game.game_id}`);
    }
  }

  async function handleGoToAuction() {
    const trimmed = displayName.trim();
    const code = inviteCode.trim().toUpperCase();
    if (!code) { setInviteError("Indtast invitationskoden du har fået af værten."); return; }
    if (!trimmed) { setNameError("Indtast venligst et navn for at fortsætte."); return; }

    setNameError(null);
    setInviteError(null);
    setIsSaving(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? null;

      const { data: gameRow, error: gameErr } = await supabase
        .from("games").select("id").eq("invite_code", code).maybeSingle();
      if (gameErr) { alert(gameErr.message); return; }
      if (!gameRow?.id) {
        setInviteError("Ukendt kode — tjek med værten (store bogstaver).");
        setIsSaving(false);
        return;
      }

      const gameId = String(gameRow.id);

      // Rejoin: find eksisterende spiller via user_id (foretrukket) eller navn
      let existingId: string | null = null;
      if (uid) {
        const { data } = await supabase
          .from("players").select("id,name").eq("game_id", gameId).eq("user_id", uid).maybeSingle();
        if (data?.id) existingId = String(data.id);
      }
      if (!existingId) {
        const { data } = await supabase
          .from("players").select("id").eq("game_id", gameId).eq("name", trimmed).maybeSingle();
        if (data?.id) existingId = String(data.id);
      }

      const playerId = existingId ?? await (async () => {
        const row: Record<string, unknown> = { name: trimmed, coins: 1000, points: 0, game_id: gameId };
        if (uid) row.user_id = uid;
        const { data, error } = await supabase.from("players").insert([row]).select("id").single();
        if (error) throw error;
        return String(data.id);
      })();

      try {
        localStorage.setItem(PLAYER_ID_KEY, playerId);
        localStorage.setItem(PLAYER_NAME_KEY, trimmed);
        localStorage.setItem(PLAYER_GAME_ID_KEY, gameId);
      } catch { /* ignore */ }

      router.push("/auction");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      alert(`Fejl: ${message}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-[#030711] text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(59,130,246,0.22),transparent_55%),radial-gradient(ellipse_90%_50%_at_100%_50%,rgba(30,58,138,0.2),transparent_50%),radial-gradient(ellipse_80%_40%_at_0%_80%,rgba(15,23,42,0.9),transparent_45%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(3,7,17,0.85))]" aria-hidden />

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {STAR_POSITIONS.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              opacity: s.opacity,
              boxShadow: s.size > 1 ? "0 0 6px 1px rgba(255,255,255,0.35)" : undefined,
            }}
          />
        ))}
      </div>

      {/*
        ── CHAMPIONS LEAGUE-REGLER (gem til næste CL-sæson) ──────────────────
        Header:   Sæson 25/26 · Champions League · Auktion 25/26
        Tagline:  Real-time auktion mellem 2–8 spillere. Byd løst, byg din trup
                  og scorer gennem turneringen.
        Kamp-point:
          Sejr (90 min): 150  · Sejr forl./str.: 50  · Uafgjort: 50  · Nederlag: 0
        Avancement:
          1/8: 100  · KV: 200  · SF: 400  · Finale: 600  · Vinder: 800
        ──────────────────────────────────────────────────────────────────────
      */}

      <header className="relative z-10 flex items-center justify-center gap-2 pt-10 pb-4">
        <Sparkles className="size-5 text-amber-300/90" strokeWidth={1.75} />
        <span className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
          VM 2026
        </span>
        <Sparkles className="size-5 text-amber-300/90" strokeWidth={1.75} />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-16 pt-2 sm:px-8">
        <h1 className="text-center font-semibold tracking-tight text-balance">
          <span className="block bg-gradient-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-3xl leading-tight text-transparent sm:text-4xl md:text-5xl">
            Verdensmesterskabet
          </span>
          <span className="mt-1 block bg-gradient-to-r from-amber-200 via-amber-100 to-amber-300 bg-clip-text text-2xl text-transparent sm:text-3xl md:text-4xl">
            Auktion 2026
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-slate-400">
          Real-time auktion mellem 2–8 spillere. Byd på VM-hold, byg din trup og følg
          pointene gennem hele turneringen.
        </p>

        {/* Two-column layout on desktop */}
        <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">

          {/* ── LEFT: Rules + Join form ── */}
          <div className="flex flex-1 flex-col gap-6 lg:max-w-lg">
            <section
              className={cn(
                "rounded-2xl border border-white/[0.08] bg-slate-950/55 p-5 shadow-xl shadow-blue-950/40 backdrop-blur-md",
                "ring-1 ring-inset ring-white/[0.06]",
              )}
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                <Trophy className="size-4 text-amber-400/90" aria-hidden />
                Sådan spilles det
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li className="flex gap-3">
                  <Users className="mt-0.5 size-4 shrink-0 text-blue-400/80" aria-hidden />
                  <span>
                    Hver spiller starter med{" "}
                    <strong className="font-semibold text-white">1.000 mønter</strong>.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-400/80" aria-hidden />
                  <span>
                    Hold trækkes ét ad gangen. Alle afgiver et{" "}
                    <strong className="font-semibold text-white">blindt bud</strong>; når alle har
                    budt, afsløres tallene — højeste bud vinder (ved uafgjort: om-auktion).
                  </span>
                </li>
              </ul>

              <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">
                  Kamp-point
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Sejr (ordinær tid): <strong className="text-slate-200">150</strong>
                  {" · "}
                  Sejr (forl. / str.): <strong className="text-slate-200">50</strong>
                  {" · "}
                  Uafgjort: <strong className="text-slate-200">50</strong>
                  {" · "}
                  Nederlag: <strong className="text-slate-200">0</strong>
                </p>
                <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">
                  Avancement-bonusser
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  1/16-finale: <strong className="text-slate-200">100</strong>
                  {" · "}
                  1/8-finale: <strong className="text-slate-200">200</strong>
                  {" · "}
                  Kvartfinale: <strong className="text-slate-200">400</strong>
                  {" · "}
                  Semifinale: <strong className="text-slate-200">600</strong>
                  {" · "}
                  Finale: <strong className="text-slate-200">800</strong>
                  {" · "}
                  Vinder: <strong className="text-amber-200/90">1.000</strong>
                </p>
              </div>
            </section>

            <div className="space-y-3">
              <label htmlFor="invite-code" className="block text-xs font-medium text-slate-400">
                Invitationskode
              </label>
              <Input
                id="invite-code"
                name="invite-code"
                autoComplete="off"
                placeholder="Fx. AB12CD34"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase());
                  if (inviteError) setInviteError(null);
                }}
                disabled={isSaving}
                aria-invalid={inviteError ? true : undefined}
                aria-describedby={inviteError ? "invite-code-error" : undefined}
                className={cn(
                  "h-11 border-white/15 bg-white/[0.06] text-base uppercase tracking-wider text-white placeholder:text-slate-500",
                  "focus-visible:border-amber-400/50 focus-visible:ring-amber-400/25 md:text-sm",
                  inviteError && "border-red-400/50 focus-visible:border-red-400/60 focus-visible:ring-red-400/20",
                )}
              />
              {inviteError ? (
                <p id="invite-code-error" role="alert" className="text-xs text-red-300/95">
                  {inviteError}
                </p>
              ) : null}

              <label htmlFor="player-name" className="block text-xs font-medium text-slate-400">
                Dit navn
              </label>
              <Input
                id="player-name"
                name="player-name"
                autoComplete="nickname"
                placeholder="Fx. Dit kaldenavn i spillet"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                disabled={isSaving}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "player-name-error" : undefined}
                className={cn(
                  "h-11 border-white/15 bg-white/[0.06] text-base text-white placeholder:text-slate-500",
                  "focus-visible:border-amber-400/50 focus-visible:ring-amber-400/25 md:text-sm",
                  nameError && "border-red-400/50 focus-visible:border-red-400/60 focus-visible:ring-red-400/20",
                )}
              />
              {nameError ? (
                <p id="player-name-error" role="alert" className="text-xs text-red-300/95">
                  {nameError}
                </p>
              ) : null}
              <Button
                type="button"
                size="lg"
                disabled={isSaving}
                onClick={() => void handleGoToAuction()}
                className={cn(
                  "relative h-11 w-full text-base font-semibold shadow-lg transition-all",
                  "border border-amber-400/30 bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 text-slate-950",
                  "hover:from-amber-200 hover:via-amber-100 hover:to-amber-200 hover:shadow-amber-500/20",
                  "focus-visible:ring-amber-400/40",
                  "disabled:opacity-70 disabled:hover:translate-y-0",
                )}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    Gemmer…
                  </>
                ) : (
                  "Gå til Auktion"
                )}
              </Button>

              <p className="pt-2 text-center text-xs text-slate-500">
                <Link href="/score" className="text-slate-300 underline-offset-2 hover:underline">
                  Min stilling
                </Link>
                {" · "}
                Værter:{" "}
                <Link href="/auction/admin" className="text-amber-200/90 underline-offset-2 hover:underline">
                  opret nyt spil og få en kode
                </Link>
              </p>

              <Link
                href="/auction/admin"
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-200/90 transition-colors hover:bg-amber-500/20",
                )}
              >
                🛡️ Gå til spil-admin
              </Link>

              {userEmail && (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                  <span className="text-xs text-slate-500 truncate">{userEmail}</span>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="ml-3 shrink-0 text-xs text-slate-400 hover:text-red-300 underline-offset-2 hover:underline"
                  >
                    Log ud
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Mine spil ── */}
          <div className="lg:w-80 xl:w-96">
            <section
              className={cn(
                "rounded-2xl border border-white/[0.08] bg-slate-950/55 shadow-xl shadow-blue-950/40 backdrop-blur-md",
                "ring-1 ring-inset ring-white/[0.06]",
              )}
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                  <Trophy className="size-4 text-amber-400/90" aria-hidden />
                  Mine spil
                </h2>
                {myGames.length > 0 && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-400">
                    {myGames.length}
                  </span>
                )}
              </div>

              {gamesLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="size-5 animate-spin text-amber-400/60" />
                </div>
              ) : !userId ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  Log ind for at se dine spil.
                </p>
              ) : myGames.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  Du er ikke tilmeldt nogen spil endnu.
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {myGames.map((g) => {
                    const isActive = g.auction_status && g.auction_status !== "finished";
                    return (
                      <li key={g.game_id}>
                        <button
                          type="button"
                          onClick={() => handleEnterGame(g)}
                          className="group flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.04]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">
                              {g.label ?? `Spil ${g.invite_code}`}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Kode: <span className="font-mono tracking-wider text-slate-400">{g.invite_code}</span>
                              {" · "}
                              <span className="text-slate-400">{g.points} point</span>
                            </p>
                            <p className="mt-1">
                              {isActive ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-medium text-emerald-300">
                                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  Auktion igangværende
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 px-2 py-0.5 text-[0.65rem] font-medium text-slate-400">
                                  Turnering
                                </span>
                              )}
                            </p>
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-slate-600 transition-colors group-hover:text-slate-400" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

        </div>
      </main>
    </div>
  );
}
