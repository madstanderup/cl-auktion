"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Handshake, Inbox, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  GAME_ADMIN_SESSION_KEY,
  PLAYER_ID_KEY,
  type GameAdminSession,
} from "@/lib/player-storage";
import { formatStake } from "@/lib/side-bets";

export type SideBet = {
  id: string;
  game_id: string;
  bookie_player_id: string;
  better_player_id: string;
  description: string;
  odds: number;
  stake: number;
  currency: string;
  status: "pending" | "accepted" | "declined";
  turn_player_id: string;
  read_by_bookie: boolean;
  read_by_better: boolean;
  created_at: string;
};

export function SideBetInbox({ gameId }: { gameId: string }) {
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [bets, setBets] = useState<SideBet[]>([]);
  const [playerNames, setPlayerNames] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // bet-id der arbejdes på
  const [negotiateId, setNegotiateId] = useState<string | null>(null);
  const [negOdds, setNegOdds] = useState("");
  const [negStake, setNegStake] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try { setMyPlayerId(localStorage.getItem(PLAYER_ID_KEY)); } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(GAME_ADMIN_SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as GameAdminSession;
        setIsAdmin(session.gameId === gameId);
      }
    } catch { /* ignore */ }
  }, [gameId]);

  useEffect(() => {
    if (!gameId || (!myPlayerId && !isAdmin)) return;
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, myPlayerId, isAdmin]);

  // Luk panelet ved klik udenfor
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function load() {
    if (!myPlayerId && !isAdmin) return;
    // Admin ser alle spillets bets; spillere ser kun deres egne
    let query = supabase.from("side_bets")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false });
    if (!isAdmin && myPlayerId) {
      query = query.or(`bookie_player_id.eq.${myPlayerId},better_player_id.eq.${myPlayerId}`);
    }
    const [betsRes, playersRes] = await Promise.all([
      query,
      supabase.from("players").select("id, name").eq("game_id", gameId),
    ]);
    setBets((betsRes.data ?? []) as SideBet[]);
    setPlayerNames(new Map((playersRes.data ?? []).map((p) => [String(p.id), String(p.name)])));
  }

  function isUnread(b: SideBet): boolean {
    if (!myPlayerId) return false;
    if (b.bookie_player_id === myPlayerId) return !b.read_by_bookie;
    if (b.better_player_id === myPlayerId) return !b.read_by_better;
    return false;
  }

  const unreadCount = bets.filter(isUnread).length;

  async function openPanel() {
    setOpen(true);
    // Markér alle mine som læst
    if (!myPlayerId) return;
    const unread = bets.filter(isUnread);
    if (unread.length === 0) return;
    await Promise.all(unread.map((b) =>
      supabase.from("side_bets")
        .update(b.bookie_player_id === myPlayerId ? { read_by_bookie: true } : { read_by_better: true })
        .eq("id", b.id)
    ));
    void load();
  }

  async function respond(bet: SideBet, action: "accept" | "decline") {
    if (!myPlayerId) return;
    setBusy(bet.id);
    const iAmBookie = bet.bookie_player_id === myPlayerId;
    await supabase.from("side_bets").update({
      status: action === "accept" ? "accepted" : "declined",
      // Modparten skal notificeres
      ...(iAmBookie ? { read_by_better: false, read_by_bookie: true } : { read_by_bookie: false, read_by_better: true }),
      updated_at: new Date().toISOString(),
    }).eq("id", bet.id);
    setBusy(null);
    void load();
  }

  async function sendNegotiation(bet: SideBet) {
    if (!myPlayerId) return;
    const odds = parseFloat(negOdds.replace(",", "."));
    const stake = parseFloat(negStake.replace(",", "."));
    if (!Number.isFinite(odds) || odds <= 1 || !Number.isFinite(stake) || stake <= 0) return;
    setBusy(bet.id);
    const iAmBookie = bet.bookie_player_id === myPlayerId;
    const otherId = iAmBookie ? bet.better_player_id : bet.bookie_player_id;
    await supabase.from("side_bets").update({
      odds,
      stake,
      turn_player_id: otherId,
      ...(iAmBookie ? { read_by_better: false, read_by_bookie: true } : { read_by_bookie: false, read_by_better: true }),
      updated_at: new Date().toISOString(),
    }).eq("id", bet.id);
    setBusy(null);
    setNegotiateId(null);
    void load();
  }

  async function deleteBet(bet: SideBet) {
    if (!confirm("Slet dette sidebet permanent?")) return;
    setBusy(bet.id);
    await supabase.from("side_bets").delete().eq("id", bet.id);
    setBusy(null);
    void load();
  }

  // Vis for spillere og spil-admins
  if (!myPlayerId && !isAdmin) return null;

  return (
    <div ref={panelRef} className="fixed right-3 top-3 z-[60]">
      {/* Knap */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void openPanel())}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-full border shadow-lg transition-colors",
          open
            ? "border-amber-400/40 bg-amber-500/20 text-amber-300"
            : "border-white/15 bg-slate-900/90 text-slate-300 hover:text-white backdrop-blur"
        )}
        title="Sidebets"
      >
        <Inbox className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[0.6rem] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-md">
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-slate-500">
            Sidebets
          </p>

          {bets.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-600">Ingen sidebets endnu.</p>
          ) : (
            <div className="space-y-2">
              {bets.map((bet) => {
                const iAmBookie = bet.bookie_player_id === myPlayerId;
                const otherName = playerNames.get(iAmBookie ? bet.better_player_id : bet.bookie_player_id) ?? "?";
                const bookieName = playerNames.get(bet.bookie_player_id) ?? "?";
                const betterName = playerNames.get(bet.better_player_id) ?? "?";
                const myTurn = bet.status === "pending" && bet.turn_player_id === myPlayerId;
                const isBusy = busy === bet.id;
                const negotiating = negotiateId === bet.id;

                return (
                  <div key={bet.id} className={cn(
                    "rounded-lg border px-3 py-2.5",
                    bet.status === "accepted" ? "border-emerald-500/30 bg-emerald-950/20"
                    : bet.status === "declined" ? "border-red-500/20 bg-red-950/10 opacity-70"
                    : myTurn ? "border-amber-400/30 bg-amber-950/20"
                    : "border-white/10 bg-slate-900/50"
                  )}>
                    {/* Parter */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-300">
                        <span className="font-semibold text-white">{bookieName}</span>
                        <span className="text-slate-500"> (bookie) vs </span>
                        <span className="font-semibold text-white">{betterName}</span>
                      </p>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider",
                          bet.status === "accepted" ? "bg-emerald-500/20 text-emerald-400"
                          : bet.status === "declined" ? "bg-red-500/20 text-red-400"
                          : "bg-amber-500/20 text-amber-300"
                        )}>
                          {bet.status === "accepted" ? "Aftalt" : bet.status === "declined" ? "Afvist" : "Åben"}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void deleteBet(bet)}
                            title="Slet sidebet (admin)"
                            className="rounded p-1 text-slate-600 hover:bg-red-500/15 hover:text-red-400 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </span>
                    </div>

                    {/* Beskrivelse */}
                    {bet.description && (
                      <p className="mt-1 text-xs text-slate-400">{bet.description}</p>
                    )}

                    {/* Vilkår */}
                    <p className="mt-1.5 text-xs">
                      <span className="font-bold tabular-nums text-amber-300">Odds {Number(bet.odds).toLocaleString("da-DK")}</span>
                      <span className="text-slate-500"> · Stake </span>
                      <span className="font-bold tabular-nums text-white">{formatStake(bet.currency, Number(bet.stake))}</span>
                    </p>

                    {/* Status / handlinger */}
                    {bet.status === "pending" && !myTurn && (
                      <p className="mt-1.5 text-[0.65rem] text-slate-500">Afventer svar fra {otherName}…</p>
                    )}

                    {myTurn && !negotiating && (
                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void respond(bet, "accept")}
                          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-500/20 px-2 py-1.5 text-[0.65rem] font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                          Bet
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setNegotiateId(bet.id);
                            setNegOdds(String(bet.odds));
                            setNegStake(String(bet.stake));
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-amber-500/20 px-2 py-1.5 text-[0.65rem] font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                        >
                          <Handshake className="size-3" />
                          Negotiate
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void respond(bet, "decline")}
                          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-500/15 px-2 py-1.5 text-[0.65rem] font-semibold text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                        >
                          <X className="size-3" />
                          Decline
                        </button>
                      </div>
                    )}

                    {/* Forhandlings-inputs */}
                    {myTurn && negotiating && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex gap-1.5">
                          <label className="flex-1">
                            <span className="text-[0.55rem] uppercase tracking-wider text-slate-500">Odds</span>
                            <input
                              type="number" step="0.1" min="1.1"
                              value={negOdds}
                              onChange={(e) => setNegOdds(e.target.value)}
                              className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-white tabular-nums focus:border-amber-400/50 focus:outline-none"
                            />
                          </label>
                          <label className="flex-1">
                            <span className="text-[0.55rem] uppercase tracking-wider text-slate-500">Stake</span>
                            <input
                              type="number" step="any" min="0"
                              value={negStake}
                              onChange={(e) => setNegStake(e.target.value)}
                              className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-white tabular-nums focus:border-amber-400/50 focus:outline-none"
                            />
                          </label>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void sendNegotiation(bet)}
                            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-amber-500/25 px-2 py-1.5 text-[0.65rem] font-semibold text-amber-200 hover:bg-amber-500/35 transition-colors disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 className="size-3 animate-spin" /> : <Handshake className="size-3" />}
                            Send modbud
                          </button>
                          <button
                            type="button"
                            onClick={() => setNegotiateId(null)}
                            className="rounded-md bg-white/5 px-3 py-1.5 text-[0.65rem] text-slate-400 hover:bg-white/10 transition-colors"
                          >
                            Fortryd
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
