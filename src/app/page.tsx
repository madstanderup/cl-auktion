"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Trophy, Users } from "lucide-react";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
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

export default function Home() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
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

  async function handleGoToAuction() {
    const trimmed = displayName.trim();
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      setInviteError("Indtast invitationskoden du har fået af værten.");
      return;
    }
    if (!trimmed) {
      setNameError("Indtast venligst et navn for at fortsætte.");
      return;
    }

    setNameError(null);
    setInviteError(null);
    setIsSaving(true);

    try {
      const spillerNavn = trimmed;
      const { data: gameRow, error: gameErr } = await supabase
        .from("games")
        .select("id")
        .eq("invite_code", code)
        .maybeSingle();

      if (gameErr) {
        alert(gameErr.message);
        return;
      }
      if (!gameRow?.id) {
        setInviteError("Ukendt kode — tjek med værten (store bogstaver).");
        setIsSaving(false);
        return;
      }

      const gameId = String(gameRow.id);

      const { data, error } = await supabase
        .from("players")
        .insert([{ name: spillerNavn, coins: 1000, points: 0, game_id: gameId }])
        .select("id")
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      try {
        if (data?.id) localStorage.setItem(PLAYER_ID_KEY, data.id);
        localStorage.setItem(PLAYER_NAME_KEY, spillerNavn);
        localStorage.setItem(PLAYER_GAME_ID_KEY, gameId);
      } catch {
        /* ignore storage errors (private mode etc.) */
      }

      router.push("/auction");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Uventet fejl ved oprettelse af spiller.";
      alert(message);
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

      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-16 pt-2 sm:max-w-xl sm:px-8">
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

        <section
          className={cn(
            "mt-10 rounded-2xl border border-white/[0.08] bg-slate-950/55 p-5 shadow-xl shadow-blue-950/40 backdrop-blur-md",
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

        <div className="mt-10 space-y-3">
          <label htmlFor="invite-code" className="block text-xs font-medium text-slate-400">
            Invitationskode
          </label>
          <Input
            id="invite-code"
            name="invite-code"
            autoComplete="off"
            placeholder="Fx. AB12CD34 — migrerede DB: DEFAULT"
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
            <p
              id="player-name-error"
              role="alert"
              className="text-xs text-red-300/95"
            >
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
                <Loader2
                  className="size-4 shrink-0 animate-spin"
                  aria-hidden
                />
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
        </div>
      </main>
    </div>
  );
}
