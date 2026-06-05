"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Status = "loading" | "success" | "error";

export default function AuthConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error_description") ?? searchParams.get("error");

    if (errorParam) {
      setErrorMsg(decodeURIComponent(errorParam));
      setStatus("error");
      return;
    }

    if (!code) {
      // Might be hash-based flow — check hash
      const hash = window.location.hash;
      if (hash.includes("access_token")) {
        // Supabase implicit flow — session is set automatically by the client
        setStatus("success");
        setTimeout(() => router.push("/"), 3000);
      } else {
        setErrorMsg("Ingen bekræftelseskode fundet. Prøv at registrere dig igen.");
        setStatus("error");
      }
      return;
    }

    // PKCE flow — exchange code for session
    const supabase = createClient();
    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setErrorMsg(error.message);
        setStatus("error");
      } else {
        setStatus("success");
        setTimeout(() => router.push("/"), 3000);
      }
    });
  }, [router, searchParams]);

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#030711] px-5 text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(59,130,246,0.22),transparent_55%)]"
        aria-hidden
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Sparkles className="size-5 text-amber-300/90" strokeWidth={1.75} />
          <span className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">VM 2026</span>
          <Sparkles className="size-5 text-amber-300/90" strokeWidth={1.75} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-8 text-center shadow-2xl shadow-blue-950/40 backdrop-blur">
          {status === "loading" && (
            <>
              <Loader2 className="mx-auto size-10 animate-spin text-amber-400/80" />
              <h1 className="mt-4 text-lg font-semibold text-white">Bekræfter din konto…</h1>
              <p className="mt-2 text-sm text-slate-400">Et øjeblik.</p>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="mx-auto size-12 text-emerald-400" />
              <h1 className="mt-4 text-lg font-semibold text-white">Konto bekræftet! 🎉</h1>
              <p className="mt-2 text-sm text-slate-400">
                Din konto er nu aktiveret. Du bliver automatisk sendt videre til forsiden…
              </p>
              <Link
                href="/"
                className="mt-6 block text-xs text-amber-200/90 hover:underline underline-offset-2"
              >
                Gå til forsiden nu →
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="mx-auto size-12 text-red-400" />
              <h1 className="mt-4 text-lg font-semibold text-white">Noget gik galt</h1>
              <p className="mt-2 text-sm text-slate-400">{errorMsg}</p>
              <div className="mt-6 flex flex-col gap-2">
                <Link
                  href="/register"
                  className="text-xs text-amber-200/90 hover:underline underline-offset-2"
                >
                  Prøv at registrere dig igen
                </Link>
                <Link
                  href="/login"
                  className="text-xs text-slate-400 hover:underline underline-offset-2"
                >
                  Gå til login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
