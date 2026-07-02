"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, X } from "lucide-react";

const SEEN_KEY = "cl-auction-scoring-v2-seen";

/**
 * Engangs-popup der forklarer den nye progressive pointtildeling.
 * Vises én gang pr. browser (localStorage-flag).
 */
export function ScoringUpdateModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch { /* ignore */ }
  }, []);

  function dismiss() {
    try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-400/25 bg-slate-950 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-amber-500/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-amber-300" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-200">Nyt: point tildeles løbende</h2>
          </div>
          <button type="button" onClick={dismiss} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-slate-300">
          <p>
            Vi har justeret <span className="font-semibold text-white">hvornår</span> point tildeles —
            <span className="font-semibold text-emerald-300"> ingen totaler ændrer sig</span>, men point
            for at nå en runde kommer nu med det samme i stedet for når holdet ryger ud:
          </p>
          <ul className="space-y-1.5 text-xs">
            {[
              ["Går videre fra gruppespillet", "+100"],
              ["Vinder 1/16-finalen (kval. til 1/8)", "+100"],
              ["Vinder 1/8-finalen (kval. til 1/4)", "+200"],
              ["Vinder kvartfinalen (kval. til 1/2)", "+200"],
              ["Vinder semifinalen (kval. til finalen)", "+200"],
              ["Vinder finalen (verdensmester)", "+200"],
            ].map(([label, pts]) => (
              <li key={label} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-1.5">
                <span>{label}</span>
                <span className="shrink-0 font-bold text-amber-300">{pts} pt</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            Kamppoint (sejr +150, uafgjort +50 osv.) er uændrede. Et holds samlede point ved exit
            er præcis som før — fx er en semifinale-exit stadig 600 pt i bonus, og VM-titlen 1.000 pt.
            Din stilling er derfor hoppet lidt op: det er point du alligevel havde til gode.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-5 py-3.5">
          <Link href="/regler" onClick={dismiss} className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200">
            Læs alle regler
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300 transition-colors"
          >
            Forstået 👍
          </button>
        </div>
      </div>
    </div>
  );
}
