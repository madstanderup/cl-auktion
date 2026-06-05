"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setError(error.message); return; }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#030711] px-5 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(59,130,246,0.22),transparent_55%)]" aria-hidden />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Sparkles className="size-5 text-amber-300/90" strokeWidth={1.75} />
          <span className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">VM 2026</span>
          <Sparkles className="size-5 text-amber-300/90" strokeWidth={1.75} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-8 shadow-2xl shadow-blue-950/40 backdrop-blur">
          <h1 className="text-xl font-semibold tracking-tight text-white">Log ind</h1>
          <p className="mt-1 text-sm text-slate-400">Brug din konto til at deltage i auktionen.</p>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-400">Email</label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="din@email.dk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleLogin()}
                disabled={loading}
                className="mt-1 h-11 border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-400">Adgangskode</label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleLogin()}
                disabled={loading}
                className="mt-1 h-11 border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
            )}

            <Button
              type="button"
              size="lg"
              disabled={loading || !email.trim() || !password}
              onClick={() => void handleLogin()}
              className={cn(
                "w-full border border-amber-400/30 bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 text-slate-950 font-semibold",
                "hover:from-amber-200 hover:via-amber-100 hover:to-amber-200",
              )}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Log ind"}
            </Button>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            Har du ikke en konto?{" "}
            <Link href="/register" className="text-amber-200/90 hover:underline underline-offset-2">
              Opret konto
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
