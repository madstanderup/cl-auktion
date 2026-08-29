"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Copy,
  Gavel,
  Loader2,
  Settings2,
  ShieldCheck,
  Shuffle,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { GameAdminSession } from "@/lib/player-storage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { withTimeout } from "@/lib/with-timeout";

/** Husk om værten har dokken foldet ud, så den ikke popper op igen ved hver runde. */
const DOCK_OPEN_KEY = "cl-auction-admin-dock-open";

type Props = {
  session: GameAdminSession;
  status: string;
  currentTeamName: string | null;
  currentPhase: number;
  tieBreakMinBid: number | null;
  bidsCurrentRound: number;
  playersTotal: number;
  teamsWithoutOwner: number;
  /** Kaldes efter en handling så siden kan hente stats og spillere igen. */
  onAction?: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  waiting:     "Venter",
  bidding:     "Bud i gang",
  revealed:    "Afsløret",
  tie_breaker: "Om-auktion",
  finished:    "Afsluttet",
};

export function AuctionAdminDock({
  session,
  status,
  currentTeamName,
  currentPhase,
  tieBreakMinBid,
  bidsCurrentRound,
  playersTotal,
  teamsWithoutOwner,
  onAction,
}: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(DOCK_OPEN_KEY) !== "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(DOCK_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const rpcArgs = { p_game_id: session.gameId, p_admin_secret: session.adminSecret };

  const isBiddingOpen = status === "bidding" || status === "tie_breaker";
  const allBidsIn = isBiddingOpen && playersTotal > 0 && bidsCurrentRound >= playersTotal;

  async function run(
    key: string,
    label: string,
    rpc: string,
    args: Record<string, unknown>,
    describe: (payload: Record<string, unknown>) => string,
  ) {
    setLoading(key);
    setMessage(null);
    try {
      const { data, error } = await withTimeout(supabase.rpc(rpc, args), label);
      if (error) {
        setMessage(`Fejl: ${error.message}`);
        return;
      }
      const payload = (data ?? {}) as Record<string, unknown>;
      if (payload.ok === false) {
        setMessage(String(payload.error ?? "Handlingen fejlede."));
        return;
      }
      setMessage(describe(payload));
      onAction?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ukendt fejl.");
    } finally {
      setLoading(null);
    }
  }

  function handleDrawNextTeam() {
    void run("draw", "Træk af hold", "admin_draw_next_team", rpcArgs, (p) =>
      p.status === "bidding" && p.team_name
        ? `Ny runde: ${String(p.team_name)}`
        : String(p.message ?? "Ingen hold tilbage."),
    );
  }

  function handleReveal() {
    void run("reveal", "Afsløring af runde", "admin_reveal_and_find_winner", rpcArgs, (p) => {
      if (p.status === "tie_breaker") {
        const tied = Array.isArray(p.tied_player_ids) ? p.tied_player_ids.length : 0;
        return `Uafgjort! Om-auktion mellem ${tied} spillere. Min bud: ${Number(p.max_bid ?? 0)}`;
      }
      if (p.status === "resolved") {
        return `Vinder: ${String(p.winner_name ?? "ukendt")} for ${Number(p.winning_bid ?? 0)} mønter.`;
      }
      return `Status: ${String(p.status ?? "ukendt")}`;
    });
  }

  function handleFinishAuction() {
    if (!window.confirm("Afslut auktionen? Status sættes til 'finished'.")) return;
    void run("finish", "Afslutning af auktion", "admin_finish_auction", rpcArgs, () =>
      "Auktionen er afsluttet.",
    );
  }

  async function handleRandomAssign() {
    if (!window.confirm("Tildel alle uejede hold tilfældigt til spillerne?")) return;
    setLoading("assign");
    setMessage(null);
    try {
      const { data: unowned, error: e1 } = await supabase
        .from("game_teams")
        .select("id")
        .eq("game_id", session.gameId)
        .is("owner_player_id", null);
      if (e1) { setMessage(`Fejl: ${e1.message}`); return; }
      if (!unowned?.length) { setMessage("Ingen ledige hold at tildele."); return; }

      const { data: playerList, error: e2 } = await supabase
        .from("players")
        .select("id")
        .eq("game_id", session.gameId);
      if (e2 || !playerList?.length) { setMessage("Ingen spillere at tildele til."); return; }

      const shuffled = [...unowned].sort(() => Math.random() - 0.5);
      for (const [i, gt] of shuffled.entries()) {
        await supabase
          .from("game_teams")
          .update({ owner_player_id: (playerList[i % playerList.length] as { id: string }).id })
          .eq("id", gt.id as string);
      }
      setMessage(`${shuffled.length} hold tildelt tilfældigt.`);
      onAction?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ukendt fejl.");
    } finally {
      setLoading(null);
    }
  }

  function copyInviteCode() {
    void navigator.clipboard.writeText(session.inviteCode);
    setMessage(`Kode kopieret: ${session.inviteCode}`);
  }

  const busy = loading !== null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 sm:px-6 sm:pb-5">
      <div
        className={cn(
          "pointer-events-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-amber-400/25",
          "bg-slate-950/90 shadow-2xl shadow-black/60 ring-1 ring-inset ring-white/[0.06] backdrop-blur-xl",
        )}
      >
        {/* Kompakt linje — altid synlig */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-amber-200">
            <ShieldCheck className="size-3.5" aria-hidden />
            Vært
          </span>

          <span className="text-xs text-slate-400">
            {STATUS_LABELS[status] ?? status}
            {currentTeamName ? (
              <>
                {" · "}
                <span className="font-medium text-white">{currentTeamName}</span>
              </>
            ) : null}
            {status === "tie_breaker" && tieBreakMinBid != null ? (
              <span className="text-orange-300"> · min {tieBreakMinBid}</span>
            ) : null}
          </span>

          {isBiddingOpen ? (
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums",
                allBidsIn
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-white/10 bg-black/30 text-slate-300",
              )}
            >
              {bidsCurrentRound}/{playersTotal} bud
            </span>
          ) : (
            <span className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-xs tabular-nums text-slate-300">
              {teamsWithoutOwner} hold tilbage
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Kontekst-knappen: byd-runden afsløres, ellers trækkes næste hold */}
            {isBiddingOpen ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={handleReveal}
                className={cn(
                  "gap-1.5",
                  allBidsIn &&
                    "border border-emerald-400/40 bg-emerald-400 text-slate-950 hover:bg-emerald-300",
                )}
              >
                {loading === "reveal" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" aria-hidden />
                )}
                Afslør
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={busy || teamsWithoutOwner === 0}
                onClick={handleDrawNextTeam}
                className="gap-1.5"
              >
                {loading === "draw" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Gavel className="size-3.5" aria-hidden />
                )}
                Næste hold
              </Button>
            )}

            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={toggleOpen}
              aria-expanded={open}
              aria-label={open ? "Skjul værtsværktøjer" : "Vis værtsværktøjer"}
              className="text-slate-400 hover:text-white"
            >
              <ChevronDown
                className={cn("size-4 transition-transform", open ? "" : "rotate-180")}
                aria-hidden
              />
            </Button>
          </div>
        </div>

        {/* Udfoldet panel */}
        {open ? (
          <div className="border-t border-white/[0.07] px-3 py-3 sm:px-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full gap-1.5"
                disabled={busy || isBiddingOpen || teamsWithoutOwner === 0}
                title={isBiddingOpen ? "Afslør runden først" : undefined}
                onClick={handleDrawNextTeam}
              >
                {loading === "draw" ? <Loader2 className="size-3.5 animate-spin" /> : <Gavel className="size-3.5" aria-hidden />}
                Træk næste hold
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full gap-1.5"
                disabled={busy}
                onClick={handleReveal}
              >
                {loading === "reveal" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" aria-hidden />}
                Afslør og find vinder
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full gap-1.5"
                disabled={busy || teamsWithoutOwner === 0}
                onClick={() => void handleRandomAssign()}
              >
                {loading === "assign" ? <Loader2 className="size-3.5 animate-spin" /> : <Shuffle className="size-3.5" aria-hidden />}
                Tildel resterende hold
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full gap-1.5 border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                disabled={busy || status === "finished"}
                onClick={handleFinishAuction}
              >
                {loading === "finish" ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" aria-hidden />}
                Afslut auktion
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
                Kode
              </span>
              <code className="text-sm font-bold tracking-widest text-white">{session.inviteCode}</code>
              <Button type="button" size="xs" variant="secondary" className="gap-1" onClick={copyInviteCode}>
                <Copy className="size-3" aria-hidden />
                Kopiér
              </Button>
              <Link
                href="/auction/admin"
                className={cn(
                  buttonVariants({ variant: "outline", size: "xs" }),
                  "ml-auto gap-1 border-white/15 text-slate-300",
                )}
              >
                <Settings2 className="size-3" aria-hidden />
                Fuld admin
              </Link>
            </div>

            <p className="mt-2 text-[0.7rem] text-slate-500">
              Fase {currentPhase} · Kampresultater, spillere og sidebets styres under &laquo;Fuld admin&raquo;.
            </p>
          </div>
        ) : null}

        {message ? (
          <p className="border-t border-white/[0.07] bg-black/30 px-3 py-2 text-xs text-amber-100/90 sm:px-4">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
