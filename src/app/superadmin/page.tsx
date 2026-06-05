"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, Trash2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type UserRow = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

export default function SuperAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentEmail(user?.email ?? null);
    });
    void loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/superadmin/users");
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setMessage(body.error ?? "Ingen adgang.");
        return;
      }
      const body = await res.json() as { users: UserRow[] };
      setUsers(body.users);
    } catch {
      setMessage("Netværksfejl.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(user: UserRow) {
    if (!window.confirm(`Send nulstillings-email til ${user.email}?`)) return;
    setActionLoading(`reset-${user.id}`);
    setMessage(null);
    try {
      const res = await fetch("/api/superadmin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      setMessage(body.ok ? `Reset-email sendt til ${user.email}.` : (body.error ?? "Fejl."));
    } catch {
      setMessage("Netværksfejl.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteUser(user: UserRow) {
    if (!window.confirm(`Slet brugeren ${user.email} permanent? Dette kan ikke fortrydes.`)) return;
    setActionLoading(`delete-${user.id}`);
    setMessage(null);
    try {
      const res = await fetch("/api/superadmin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (body.ok) {
        setMessage(`Brugeren ${user.email} er slettet.`);
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
      } else {
        setMessage(body.error ?? "Fejl.");
      }
    } catch {
      setMessage("Netværksfejl.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-[#030711] px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-amber-300" />
            <h1 className="text-xl font-semibold tracking-tight">SuperAdmin</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadUsers()} disabled={loading}>
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
              Log ud
            </Button>
          </div>
        </div>

        {currentEmail && (
          <p className="mt-1 text-xs text-slate-500">Logget ind som <span className="text-slate-300">{currentEmail}</span></p>
        )}

        {message && (
          <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-sm font-medium text-white">
              Brugere <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-400">{users.length}</span>
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-amber-400/80" />
            </div>
          ) : users.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">Ingen brugere fundet.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {users.map((u) => (
                <li key={u.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{u.email}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Oprettet {new Date(u.created_at).toLocaleDateString("da-DK")}
                      {u.last_sign_in_at && (
                        <> · Sidst set {new Date(u.last_sign_in_at).toLocaleDateString("da-DK")}</>
                      )}
                      {!u.email_confirmed_at && (
                        <span className="ml-2 rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-300">Ikke bekræftet</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-1 text-xs"
                      disabled={actionLoading === `reset-${u.id}`}
                      onClick={() => void handleResetPassword(u)}
                    >
                      {actionLoading === `reset-${u.id}` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <KeyRound className="size-3" />
                      )}
                      Nulstil kode
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="gap-1 text-xs"
                      disabled={actionLoading === `delete-${u.id}` || u.email === currentEmail}
                      onClick={() => void handleDeleteUser(u)}
                    >
                      {actionLoading === `delete-${u.id}` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                      Slet
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
