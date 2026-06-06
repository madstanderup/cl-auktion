"use client";

import Link from "next/link";
import { ArrowLeft, Trophy, Gavel, Star, Users, Zap } from "lucide-react";

export default function ReglerPage() {
  return (
    <div className="min-h-screen bg-[#030711] text-slate-100">
      {/* Header */}
      <header className="border-b border-white/[0.08] bg-slate-950/40 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft className="size-4" />
            Forsiden
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">

        {/* ── Beskrivelse (bagsiden af æsken) ── */}
        <section className="rounded-2xl border border-amber-400/20 bg-gradient-to-b from-amber-500/10 to-transparent p-7 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
              <Trophy className="size-5" />
            </div>
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-400/70">Om spillet</p>
              <h1 className="text-xl font-bold text-white">VM Auktion & Fantasy</h1>
            </div>
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-slate-300">
            <p>
              Dyst i fodboldviden og forudsigelser igennem en auktion, hvor det gælder om at samle point efter hvordan dine hold klarer sig — alle 48 hold bliver fordelt igennem en auktion hvor hver spiller har 1.000 mønter. Der bydes blindt på holdene, og den der byder mest får holdet og bliver fratrukket sine mønter. Holdene allokerer derefter point til den enkelte spiller, baseret på de enkelte kampe og på hvor langt de når i turneringen.
            </p>
            <p>
              Strategien er todelt: køb hold du tror rækker langt i turneringen — sats enten på mange hold der scorer lidt point, eller få hold der scorer mange point.
            </p>
          </div>
        </section>

        {/* ── Regler ── */}
        <div className="mt-8 space-y-6">

          {/* 1. Auktionen */}
          <section className="rounded-2xl border border-white/[0.08] bg-slate-950/55 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-4 bg-blue-500/5">
              <Gavel className="size-4 text-blue-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">1. Auktionen</h2>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm text-slate-300">
              <p>Alle deltagere starter med <span className="font-semibold text-white">1.000 mønter</span>. Auktionarius sætter ét hold på auktion ad gangen.</p>
              <ul className="space-y-2 ml-3">
                <li className="flex gap-2"><span className="text-blue-400 mt-0.5">•</span><span>Alle byder <strong className="text-white">hemmeligt</strong> og samtidigt — du kan ikke se hvad de andre byder.</span></li>
                <li className="flex gap-2"><span className="text-blue-400 mt-0.5">•</span><span>Højeste bud vinder holdet. Er der <strong className="text-white">uafgjort</strong>, går holdet i om-auktion kun mellem de spillere der bød det samme.</span></li>
                <li className="flex gap-2"><span className="text-blue-400 mt-0.5">•</span><span>Du betaler dit bud i mønter. Resterende mønter giver ingen point — det handler om at købe de rigtige hold.</span></li>
                <li className="flex gap-2"><span className="text-blue-400 mt-0.5">•</span><span>Du kan ikke byde mere end du har tilbage på kontoen.</span></li>
              </ul>
              <div className="rounded-lg bg-blue-500/10 border border-blue-400/20 px-4 py-3 mt-2">
                <p className="text-xs text-blue-200/80"><span className="font-semibold">Eksempel:</span> Der er 4 spillere. Argentina sættes på auktion. Mads byder 300, Louise byder 250, Søren byder 300, Anne byder 180. Mads og Søren bød begge 300 — de går i om-auktion, og vinderen overtager Argentina til det endelige bud.</p>
              </div>
            </div>
          </section>

          {/* 2. Pointsystem */}
          <section className="rounded-2xl border border-white/[0.08] bg-slate-950/55 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-4 bg-amber-500/5">
              <Star className="size-4 text-amber-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">2. Sådan scorer du point</h2>
            </div>
            <div className="px-5 py-4 space-y-5 text-sm text-slate-300">

              {/* Gruppe */}
              <div>
                <h3 className="font-semibold text-white mb-2">Gruppespil</h3>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                    <span>Sejr (i ordinær tid)</span>
                    <span className="font-bold text-amber-300">+150 pt</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                    <span>Uafgjort</span>
                    <span className="font-bold text-amber-300">+50 pt</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                    <span>Nederlag</span>
                    <span className="text-slate-500">0 pt</span>
                  </div>
                </div>
              </div>

              {/* Knockout */}
              <div>
                <h3 className="font-semibold text-white mb-2">Knockout-runder (1/16, 1/8, KV, SF, Finale)</h3>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                    <span>Sejr i ordinær tid</span>
                    <span className="font-bold text-amber-300">+150 pt</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                    <span>Kamp til forlænget/straffe (begge hold)</span>
                    <span className="font-bold text-amber-300">+50 pt</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                    <span>Vinder i forlænget/straffe (kun vinderen)</span>
                    <span className="font-bold text-amber-300">+50 pt</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2 ml-1">Dvs. vinderen på forlænget/straffe: 100 pt i alt. Taberen: 50 pt i alt.</p>
              </div>

              {/* Avancement */}
              <div>
                <h3 className="font-semibold text-white mb-2">Avancement-bonus <span className="text-slate-400 font-normal">(til det tabende hold)</span></h3>
                <p className="text-xs text-slate-400 mb-2">Et hold der taber i en knockout-runde har alligevel nået langt — det belønner du for:</p>
                <div className="space-y-1.5">
                  {[
                    { stage: "Taber i 1/16-finale", pts: 100 },
                    { stage: "Taber i 1/8-finale", pts: 200 },
                    { stage: "Taber i kvartfinale", pts: 400 },
                    { stage: "Taber i semifinale", pts: 600 },
                    { stage: "Taber i finale (sølvmedalje)", pts: 800 },
                  ].map(({ stage, pts }) => (
                    <div key={stage} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                      <span>{stage}</span>
                      <span className="font-bold text-amber-300">+{pts} pt</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Finalevinder */}
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="size-4 text-amber-300" />
                    <span className="font-semibold text-white">VM-vinder bonus</span>
                  </div>
                  <span className="text-2xl font-bold text-amber-300">+1.000 pt</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Ejeren af det hold der vinder VM får +1.000 point ekstra oven i de øvrige point.</p>
              </div>

              {/* Eksempel */}
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Eksempel — England vinder finalen på straffe mod Egypten (1-1 e.f.t.)</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-300">🏴󠁧󠁢󠁥󠁮󠁧󠁿 England — forlænget/straffe (begge)</span>
                    <span className="text-amber-200">+50 pt</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">🏴󠁧󠁢󠁥󠁮󠁧󠁿 England — vinder på straffe</span>
                    <span className="text-amber-200">+50 pt</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">🏴󠁧󠁢󠁥󠁮󠁧󠁿 England — VM-vinder bonus</span>
                    <span className="text-amber-200">+1.000 pt</span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-1.5 mt-1.5">
                    <span className="font-semibold text-white">🏴󠁧󠁢󠁥󠁮󠁧󠁿 England i alt (denne kamp)</span>
                    <span className="font-bold text-amber-300">1.100 pt</span>
                  </div>
                  <div className="border-t border-white/10 pt-1.5 mt-1.5 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-300">🇪🇬 Egypten — forlænget/straffe (begge)</span>
                      <span className="text-amber-200">+50 pt</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-300">🇪🇬 Egypten — taber i finale (avancement-bonus)</span>
                      <span className="text-amber-200">+800 pt</span>
                    </div>
                    <div className="flex justify-between border-t border-white/10 pt-1.5 mt-1.5">
                      <span className="font-semibold text-white">🇪🇬 Egypten i alt (denne kamp)</span>
                      <span className="font-bold text-amber-300">850 pt</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </section>

          {/* 3. Vinderbetingelse */}
          <section className="rounded-2xl border border-white/[0.08] bg-slate-950/55 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-4 bg-emerald-500/5">
              <Users className="size-4 text-emerald-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">3. Hvem vinder?</h2>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm text-slate-300">
              <p>Den spiller der har flest <strong className="text-white">turneringspoint i alt</strong> fra alle sine hold tilsammen, vinder spillet — uanset hvor mange mønter der er tilbage.</p>
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-400/20 px-4 py-3">
                <p className="text-xs text-emerald-200/80"><span className="font-semibold">Tip:</span> Det kan betale sig at købe mange mellemgode hold frem for ét fantastisk hold. Et hold der taber en semifinale giver 600 point i avancement-bonus — det er mere end en hel VM-vinder-grupperunde!</p>
              </div>
            </div>
          </section>

          {/* 4. Praktisk */}
          <section className="rounded-2xl border border-white/[0.08] bg-slate-950/55 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-4 bg-purple-500/5">
              <Zap className="size-4 text-purple-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">4. Praktisk</h2>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm text-slate-300">
              <ul className="space-y-2 ml-1">
                <li className="flex gap-2"><span className="text-purple-400 mt-0.5">•</span><span>Point opdateres automatisk efter hver kamp — du behøver ikke gøre noget.</span></li>
                <li className="flex gap-2"><span className="text-purple-400 mt-0.5">•</span><span>Du kan følge din stilling og dine holds point løbende på spil-siden.</span></li>
                <li className="flex gap-2"><span className="text-purple-400 mt-0.5">•</span><span>Hold der ikke er solgt på auktion tæller ikke med i pointsystemet.</span></li>
                <li className="flex gap-2"><span className="text-purple-400 mt-0.5">•</span><span>Tredjepladsekampen tæller <strong className="text-white">ikke</strong> med i pointsystemet.</span></li>
              </ul>
            </div>
          </section>

        </div>

        {/* Back links */}
        <div className="mt-10 flex gap-3 justify-center">
          <Link href="/" className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            ← Forsiden
          </Link>
        </div>
      </main>
    </div>
  );
}
