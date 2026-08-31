"use client";

import Link from "next/link";
import { Trophy, X } from "lucide-react";

import { Starball } from "@/components/starball";

type Props = {
  gameId: string;
  teamsSold: number;
  teamsWithdrawn: number;
  onClose: () => void;
};

/**
 * Vises for alle spillere naar auktionen slutter — dvs. naar sidste hold er
 * tildelt eller udgaaet, og databasen har sat status = 'finished'.
 */
export function AuctionFinishedModal({ gameId, teamsSold, teamsWithdrawn, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-400/25 bg-slate-950 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-amber-500/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-amber-300" aria-hidden />
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-200">
              Auktionen er slut
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Luk"
            className="rounded p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm text-slate-300">
          <div className="flex justify-center">
            <Starball className="size-12 drop-shadow-[0_0_20px_rgb(43_95_217/0.5)]" />
          </div>
          <p className="text-center">
            Alle hold er fordelt. Nu er det kampene der afgør det — følg pointene i oversigten.
          </p>
          <div className="flex items-center justify-center gap-3 text-xs">
            <span className="rounded-lg border border-white/10 bg-black/25 px-3 py-1.5">
              <strong className="text-white tabular-nums">{teamsSold}</strong> hold solgt
            </span>
            {teamsWithdrawn > 0 && (
              <span className="rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-slate-400">
                <strong className="text-slate-300 tabular-nums">{teamsWithdrawn}</strong> udgået
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-400 underline underline-offset-2 transition-colors hover:text-slate-200"
          >
            Bliv her
          </button>
          <Link
            href={`/game/${gameId}/summary`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:from-amber-200 hover:via-amber-100 hover:to-amber-200"
          >
            <Trophy className="size-3.5" aria-hidden />
            Se opsamling
          </Link>
        </div>
      </div>
    </div>
  );
}
