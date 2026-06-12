"use client";

import { useState } from "react";
import { Dices, Loader2, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Player = { id: string; name: string };

export function SideBetOffer({
  gameId,
  myPlayerId,
  players,
}: {
  gameId: string;
  myPlayerId: string;
  players: Player[];
}) {
  const [opponentId, setOpponentId] = useState("");
  const [description, setDescription] = useState("");
  const [odds, setOdds] = useState("");
  const [stake, setStake] = useState("");
  const [currency, setCurrency] = useState<"kr" | "øl">("kr");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const opponents = players.filter((p) => p.id !== myPlayerId);

  const oddsNum = parseFloat(odds.replace(",", "."));
  const stakeNum = parseFloat(stake.replace(",", "."));
  const valid = opponentId && Number.isFinite(oddsNum) && oddsNum > 1 && Number.isFinite(stakeNum) && stakeNum > 0;

  async function send() {
    if (!valid) return;
    setSending(true);
    setFeedback(null);

    const { error } = await supabase.from("side_bets").insert({
      game_id: gameId,
      bookie_player_id: myPlayerId,
      better_player_id: opponentId,
      description: description.trim(),
      odds: oddsNum,
      stake: stakeNum,
      currency,
      status: "pending",
      turn_player_id: opponentId,
      read_by_bookie: true,
      read_by_better: false,
    });

    setSending(false);
    if (error) {
      setFeedback(`Fejl: ${error.message}`);
    } else {
      const name = opponents.find((p) => p.id === opponentId)?.name ?? "modspilleren";
      setFeedback(`Sidebet sendt til ${name} ✓`);
      setOpponentId("");
      setDescription("");
      setOdds("");
      setStake("");
    }
  }

  if (opponents.length === 0) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl shadow-blue-950/30">
      <div className="border-b border-white/[0.08] px-5 py-4 flex items-center gap-2">
        <Dices className="size-4 text-amber-400/80" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Tilbyd et sidebet</h2>
      </div>

      <div className="p-5 space-y-3">
        {/* Beskrivelse */}
        <label className="block">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Hvad gælder væddemålet?</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Fx: Brasilien vinder VM"
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-amber-400/50 focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Modspiller */}
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Modspiller</span>
            <select
              value={opponentId}
              onChange={(e) => setOpponentId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white focus:border-amber-400/50 focus:outline-none"
            >
              <option value="">Vælg…</option>
              {opponents.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          {/* Odds */}
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Odds</span>
            <input
              type="number" step="0.1" min="1.1"
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              placeholder="2.0"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white tabular-nums placeholder:text-slate-600 focus:border-amber-400/50 focus:outline-none"
            />
          </label>

          {/* Stake */}
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Stake</span>
            <input
              type="number" step="1" min="1"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="50"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white tabular-nums placeholder:text-slate-600 focus:border-amber-400/50 focus:outline-none"
            />
          </label>

          {/* Valuta */}
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Valuta</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "kr" | "øl")}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white focus:border-amber-400/50 focus:outline-none"
            >
              <option value="kr">Kroner</option>
              <option value="øl">Øl 🍺</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!valid || sending}
            onClick={() => void send()}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              valid && !sending
                ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                : "bg-white/5 text-slate-600 cursor-not-allowed"
            )}
          >
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Send
          </button>
          {feedback && (
            <p className={cn("text-xs", feedback.startsWith("Fejl") ? "text-red-400" : "text-emerald-400")}>
              {feedback}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
