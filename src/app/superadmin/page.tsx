"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, Trash2, KeyRound, Gamepad2, Users, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type UserRow = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

type GameRow = {
  id: string;
  invite_code: string;
  label: string | null;
  created_at: string;
  created_by: string | null;
  player_count: number;
  auction_status: string | null;
};

const SUPERADMIN_EMAIL = "madstanderup@gmail.com";

const AUCTION_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  waiting:  { label: "Venter på spillere", color: "text-slate-400 bg-slate-700/40" },
  bidding:  { label: "Auktion igangværende", color: "text-emerald-300 bg-emerald-500/15" },
  reveal:   { label: "Afslører bud", color: "text-amber-300 bg-amber-500/15" },
  finished: { label: "Afsluttet", color: "text-slate-500 bg-slate-800/60" },
};

export default function SuperAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      const email = user?.email ?? "";
      setCurrentEmail(email);
      setAuthChecked(true);
      if (email === SUPERADMIN_EMAIL) {
        void loadUsers();
        void loadGames();
      } else {
        setLoading(false);
        setGamesLoading(false);
      }
    });
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

  async function loadGames() {
    setGamesLoading(true);
    try {
      const supabase = createClient();
      const { data: gameRows } = await supabase
        .from("games")
        .select("id, invite_code, label, created_at, created_by")
        .order("created_at", { ascending: false });

      if (!gameRows || gameRows.length === 0) { setGames([]); return; }

      const gameIds = gameRows.map((g: { id: string }) => g.id);

      const [playersRes, auctionRes] = await Promise.all([
        supabase.from("players").select("game_id").in("game_id", gameIds),
        supabase.from("auction_state").select("game_id, status").in("game_id", gameIds),
      ]);

      const playerCounts = new Map<string, number>();
      for (const p of playersRes.data ?? []) {
        const gid = String(p.game_id);
        playerCounts.set(gid, (playerCounts.get(gid) ?? 0) + 1);
      }

      const auctionMap = new Map<string, string>();
      for (const a of auctionRes.data ?? []) {
        auctionMap.set(String(a.game_id), a.status as string);
      }

      setGames(gameRows.map((g: { id: string; invite_code: string; label: string | null; created_at: string; created_by: string | null }) => ({
        id: g.id,
        invite_code: g.invite_code,
        label: g.label,
        created_at: g.created_at,
        created_by: g.created_by ?? null,
        player_count: playerCounts.get(String(g.id)) ?? 0,
        auction_status: auctionMap.get(String(g.id)) ?? null,
      })));
    } finally {
      setGamesLoading(false);
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

  async function handleDeleteGame(game: GameRow) {
    if (!window.confirm(`Slet spillet "${game.label ?? game.invite_code}" permanent? Alle spillere og bud slettes også.`)) return;
    setActionLoading(`delete-game-${game.id}`);
    setMessage(null);
    try {
      const res = await fetch("/api/superadmin/delete-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (body.ok) {
        setMessage(`Spillet "${game.label ?? game.invite_code}" er slettet.`);
        setGames((prev) => prev.filter((g) => g.id !== game.id));
      } else {
        setMessage(body.error ?? "Fejl.");
      }
    } catch {
      setMessage("Netværksfejl.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSyncMatches() {
    setActionLoading("sync-matches");
    setMessage(null);
    try {
      const res = await fetch("/api/sync-matches", { method: "POST" });
      const body = await res.json() as { ok?: boolean; synced?: number; totalFromApi?: number; relevantFromApi?: number; error?: string };
      if (body.ok) {
        setMessage(`Kampe synkroniseret ✓ — ${body.synced} opdateringer, ${body.relevantFromApi ?? 0} relevante kampe fra API (${body.totalFromApi ?? 0} i alt).`);
      } else {
        setMessage(body.error ?? "Fejl ved synkronisering.");
      }
    } catch {
      setMessage("Netværksfejl ved synkronisering.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function refreshAll() {
    void loadUsers();
    void loadGames();
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030711] text-slate-600">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (currentEmail !== SUPERADMIN_EMAIL) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030711] text-slate-400">
        Ingen adgang.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030711] px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-amber-300" />
            <h1 className="text-xl font-semibold tracking-tight">SuperAdmin</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={loading || gamesLoading}>
              <RefreshCw className={`size-3.5 ${(loading || gamesLoading) ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
              Log ud
            </Button>
          </div>
        </div>

        {currentEmail && (
          <p className="-mt-6 text-xs text-slate-500">Logget ind som <span className="text-slate-300">{currentEmail}</span></p>
        )}

        {message && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </p>
        )}

        {/* ── Synkroniser kampe ── */}
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <RefreshCcw className="size-4 text-blue-400/80" />
            <p className="text-sm font-medium text-white">Kampsynkronisering</p>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <p className="text-xs text-slate-400">
              Henter alle VM 2026-kampe (planlagte + afsluttede) fra Zafronix og gemmer dem i databasen.
            </p>
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs"
              disabled={actionLoading === "sync-matches"}
              onClick={() => void handleSyncMatches()}
            >
              {actionLoading === "sync-matches" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCcw className="size-3" />
              )}
              Sync kampe
            </Button>
          </div>
        </div>

        {/* ── Spil ── */}
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <Gamepad2 className="size-4 text-amber-400/80" />
            <p className="text-sm font-medium text-white">
              Spil
              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-400">{games.length}</span>
            </p>
          </div>

          {gamesLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-amber-400/80" />
            </div>
          ) : games.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">Ingen spil oprettet endnu.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {games.map((g) => {
                const statusInfo = g.auction_status ? (AUCTION_STATUS_LABEL[g.auction_status] ?? { label: g.auction_status, color: "text-slate-400 bg-slate-700/40" }) : null;
                return (
                  <li key={g.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {g.label ?? `Spil ${g.invite_code}`}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono tracking-wider text-slate-400">{g.invite_code}</span>
                        <span className="flex items-center gap-1">
                          <Users className="size-3" />
                          {g.player_count} {g.player_count === 1 ? "spiller" : "spillere"}
                        </span>
                        <span>Oprettet {new Date(g.created_at).toLocaleDateString("da-DK")}</span>
                        {g.created_by && (
                          <span className="text-slate-400">
                            Admin: {users.find((u) => u.id === g.created_by)?.email ?? <span className="italic text-slate-600">ukendt</span>}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {statusInfo && (
                        <span className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="gap-1 text-xs"
                        disabled={actionLoading === `delete-game-${g.id}`}
                        onClick={() => void handleDeleteGame(g)}
                      >
                        {actionLoading === `delete-game-${g.id}` ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" />
                        )}
                        Slet
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Brugere ── */}
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl">
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
