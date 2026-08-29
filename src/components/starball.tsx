import { cn } from "@/lib/utils";

/**
 * Stjernebold — det klassiske Champions League-motiv som et stiliseret
 * mærke: ottetakkede stjerner lagt ud over en kugle, størst i midten og
 * mindre ude ved kanten så det læses rundt.
 */

type Star = { cx: number; cy: number; r: number; opacity: number };

/** Én ring stjerner med jævn fordeling og fast udgangsvinkel. */
function ring(count: number, radius: number, size: number, opacity: number, offset = 0): Star[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = offset + (i / count) * Math.PI * 2;
    return {
      cx: 50 + Math.cos(angle) * radius,
      cy: 50 + Math.sin(angle) * radius,
      r: size,
      opacity,
    };
  });
}

const STARS: Star[] = [
  { cx: 50, cy: 50, r: 11, opacity: 1 },
  ...ring(6, 25, 7.5, 0.92, -Math.PI / 2),
  ...ring(12, 41, 4.4, 0.6, -Math.PI / 2 + Math.PI / 12),
];

/** Ottetakket stjerne: skiftevis ydre og indre radius hele vejen rundt. */
function starPath(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.36;
  const points: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i / 16) * Math.PI * 2;
    points.push(`${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

export function Starball({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-hidden className={cn("size-8", className)}>
      <defs>
        <radialGradient id="cl-ball" cx="35%" cy="28%" r="78%">
          <stop offset="0%" stopColor="oklch(0.45 0.17 258)" />
          <stop offset="55%" stopColor="oklch(0.24 0.11 264)" />
          <stop offset="100%" stopColor="oklch(0.13 0.06 268)" />
        </radialGradient>
        <radialGradient id="cl-star" cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor="oklch(1 0 0)" />
          <stop offset="100%" stopColor="oklch(0.86 0.03 255)" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="47" fill="url(#cl-ball)" />
      <circle cx="50" cy="50" r="47" fill="none" stroke="oklch(0.78 0.10 258 / 0.35)" strokeWidth="1.5" />

      {STARS.map((s, i) => (
        <path key={i} d={starPath(s.cx, s.cy, s.r)} fill="url(#cl-star)" opacity={s.opacity} />
      ))}
    </svg>
  );
}
