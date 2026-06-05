"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Plus, ShieldCheck, Trash2, Trophy } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GameAdminSession } from "@/lib/player-storage";
import {
  GAME_ADMIN_SESSION_KEY,
  PLAYER_GAME_ID_KEY,
  PLAYER_ID_KEY,
  PLAYER_NAME_KEY,
} from "@/lib/player-storage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AuctionState = {
  current_team_name: string | null;
  status: string;
  current_phase: number | null;
  tie_break_min_bid: number | null;
};

type PlayerListRow = {
  id: string;
  name: string;
  coins: number;
  created_at: string | null;
};

type MatchRow = {
  id: string;
  home_team: string;
  away_team: string;
  stage: string;
  home_score: number | null;
  away_score: number | null;
  result_type: string | null;
  status: string;
  match_date: string | null;
};

const STAGE_LABELS: Record<string, string> = {
  group:         "Gruppespil",
  round_of_32:   "1/16-finale",
  round_of_16:   "1/8-finale",
  quarter_final: "Kvartfinale",
  semi_final:    "Semifinale",
  final:         "Finale",
};

const RESULT_TYPE_LABELS: Record<string, string> = {
  normal_time: "Ordinær tid",
  extra_time:  "Forlænget tid",
  penalties:   "Straffespark",
};

const REQUEST_TIMEOUT_MS = 12_000;

async function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} tog for lang tid. Prøv igen.`));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function readAdminSession(): GameAdminSession | null {
  try {
    const raw = localStorage.getItem(GAME_ADMIN_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof o.gameId === "string" &&
      typeof o.adminSecret === "string" &&
      typeof o.inviteCode === "string"
    ) {
      return {
        gameId: o.gameId,
        adminSecret: o.adminSecret,
        inviteCode: o.inviteCode,
        label: typeof o.label === "string" ? o.label : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeAdminSession(s: GameAdminSession) {
  localStorage.setItem(GAME_ADMIN_SESSION_KEY, JSON.stringify(s));
}

export default function AuctionAdminPage() {
  const [session, setSession] = useState<GameAdminSession | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [newGameLabel, setNewGameLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [state, setState] = useState<AuctionState | null>(null);
  const [players, setPlayers] = useState<PlayerListRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Kampresultater
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [newMatchHome, setNewMatchHome] = useState("");
  const [newMatchAway, setNewMatchAway] = useState("");
  const [newMatchStage, setNewMatchStage] = useState("group");
  const [matchAddLoading, setMatchAddLoading] = useState(false);
  // Per-kamp resultat-form state: matchId → {homeScore, awayScore, resultType}
  const [resultForms, setResultForms] = useState<Record<string, { home: string; away: string; type: string }>>({});
  const [resultLoading, setResultLoading] = useState<string | null>(null);

  useEffect(() => {
    setSession(readAdminSession());
    setSessionReady(true);
  }, []);

  const loadState = useCallback(async (gameId: string) => {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("auction_state")
          .select("current_team_name,status,current_phase,tie_break_min_bid,updated_at")
          .eq("game_id", gameId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "Hentning af auktionsstatus",
      );
      if (error) {
        setMessage(`Kunne ikke hente status: ${error.message}`);
        setState(null);
        return;
      }
      if (data) {
        setState({
          current_team_name: data.current_team_name as string | null,
          status: String(data.status),
          current_phase: Number(data.current_phase ?? 0),
          tie_break_min_bid:
            data.tie_break_min_bid == null ? null : Number(data.tie_break_min_bid),
        });
      } else {
        setState(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ukendt fejl.";
      setMessage(`Kunne ikke hente status: ${message}`);
      setState(null);
    }
  }, []);

  const loadPlayers = useCallback(async (gameId: string) => {
    setPlayersLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("players")
          .select("id,name,coins,created_at")
          .eq("game_id", gameId)
          .order("created_at", { ascending: false }),
        "Hentning af spillere",
      );
      if (error) {
        setMessage(`Kunne ikke hente spillere: ${error.message}`);
        setPlayers([]);
        return;
      }
      setPlayers(
        (data ?? []).map((r) => ({
          id: String(r.id),
          name: String(r.name),
          coins: Number(r.coins),
          created_at: r.created_at != null ? String(r.created_at) : null,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ukendt fejl.";
      setMessage(`Kunne ikke hente spillere: ${message}`);
      setPlayers([]);
    } finally {
      setPlayersLoading(false);
    }
  }, []);

  const loadMatches = useCallback(async (gameId: string) => {
    setMatchesLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("wc_matches")
          .select("id,home_team,away_team,stage,home_score,away_score,result_type,status,match_date")
          .eq("game_id", gameId)
          .order("created_at", { ascending: true }),
        "Hentning af kampe",
      );
      if (error) { setMessage(`Kunne ikke hente kampe: ${error.message}`); return; }
      setMatches(
        (data ?? []).map((r) => ({
          id: String(r.id),
          home_team: String(r.home_team),
          away_team: String(r.away_team),
          stage: String(r.stage),
          home_score: r.home_score != null ? Number(r.home_score) : null,
          away_score: r.away_score != null ? Number(r.away_score) : null,
          result_type: r.result_type != null ? String(r.result_type) : null,
          status: String(r.status),
          match_date: r.match_date != null ? String(r.match_date) : null,
        })),
      );
    } catch (err) {
      setMessage(`Fejl ved hentning af kampe: ${err instanceof Error ? err.message : "ukendt"}`);
    } finally {
      setMatchesLoading(false);
    }
  }, []);

  const loadTeamNames = useCallback(async (gameId: string) => {
    const { data } = await supabase
      .from("game_teams")
      .select("teams(name)")
      .eq("game_id", gameId)
      .not("owner_player_id", "is", null);
    const names: string[] = [];
    for (const row of data ?? []) {
      const r = row as { teams?: { name?: string } | null };
      if (r.teams?.name) names.push(String(r.teams.name));
    }
    setTeamNames(names.sort((a, b) => a.localeCompare(b, "da")));
  }, []);

  useEffect(() => {
    if (!sessionReady || !session) return;
    void loadState(session.gameId);
    void loadPlayers(session.gameId);
    void loadMatches(session.gameId);
    void loadTeamNames(session.gameId);
  }, [session, sessionReady, loadState, loadPlayers, loadMatches, loadTeamNames]);

  async function handleCreateGame() {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("create_game", {
          p_label: newGameLabel.trim() || null,
        }),
        "Oprettelse af spil",
      );
      if (error) {
        setMessage(`Kunne ikke oprette spil: ${error.message}`);
        return;
      }
      const payload = data as {
        ok?: boolean;
        error?: string;
        game_id?: string;
        invite_code?: string;
        admin_secret?: string;
        label?: string | null;
      };
      if (!payload?.ok || !payload.game_id || !payload.admin_secret || !payload.invite_code) {
        setMessage(payload?.error ?? "Oprettelse fejlede.");
        return;
      }
      const next: GameAdminSession = {
        gameId: payload.game_id,
        adminSecret: payload.admin_secret,
        inviteCode: payload.invite_code,
        label: payload.label ?? null,
      };
      writeAdminSession(next);
      try {
        localStorage.setItem(PLAYER_GAME_ID_KEY, next.gameId);
      } catch {
        /* ignore */
      }
      setSession(next);
      setMessage(
        `Nyt spil oprettet. Invitationskode: ${payload.invite_code} — del den med dine spillere.`,
      );
      void loadState(next.gameId);
      void loadPlayers(next.gameId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ukendt fejl.";
      setMessage(`Kunne ikke oprette spil: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleLeaveAdmin() {
    localStorage.removeItem(GAME_ADMIN_SESSION_KEY);
    try {
      localStorage.removeItem(PLAYER_GAME_ID_KEY);
      localStorage.removeItem(PLAYER_ID_KEY);
      localStorage.removeItem(PLAYER_NAME_KEY);
    } catch {
      /* ignore */
    }
    setSession(null);
    setState(null);
    setPlayers([]);
    setMessage("Du er logget ud som vært på denne browser.");
  }

  async function rpcArgs() {
    const s = session;
    if (!s) return null;
    return { p_game_id: s.gameId, p_admin_secret: s.adminSecret };
  }

  async function handleDrawNextTeam() {
    const args = await rpcArgs();
    if (!args) return;
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("admin_draw_next_team", args),
        "Træk af hold",
      );
      if (error) {
        setMessage(`Fejl: ${error.message}`);
        return;
      }
      const payload = data as { status?: string; team_name?: string; message?: string };
      if (payload?.status === "bidding" && payload.team_name) {
        setMessage(`Ny runde startet: ${payload.team_name}`);
      } else {
        setMessage(payload?.message ?? "Ingen hold tilbage.");
      }
      if (session) void loadState(session.gameId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ukendt fejl.";
      setMessage(`Fejl: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleReveal() {
    const args = await rpcArgs();
    if (!args) return;
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("admin_reveal_and_find_winner", args),
        "Afsløring af runde",
      );
      if (error) {
        setMessage(`Fejl: ${error.message}`);
        return;
      }

      const payload = data as {
        ok?: boolean;
        status?: string;
        error?: string;
        winner_name?: string;
        winning_bid?: number;
        tied_player_ids?: string[];
        max_bid?: number;
      };

      if (!payload?.ok) {
        setMessage(payload?.error ?? "Ukendt fejl under afsløring.");
        return;
      }

      if (payload.status === "tie_breaker") {
        setMessage(
          `Uafgjort! Om-auktion startet mellem ${payload.tied_player_ids?.length ?? 0} spillere. Min bud: ${payload.max_bid ?? 0}`,
        );
      } else if (payload.status === "resolved") {
        setMessage(
          `Vinder: ${payload.winner_name ?? "ukendt"} for ${payload.winning_bid ?? 0} mønter.`,
        );
      } else {
        setMessage(`Status: ${payload.status ?? "ukendt"}`);
      }
      if (session) void loadState(session.gameId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ukendt fejl.";
      setMessage(`Fejl: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetGame() {
    const args = await rpcArgs();
    if (!args) return;
    const confirmed = window.confirm(
      "Er du sikker på, at du vil nulstille DETTE spil (hold, bud og mønter for disse spillere)?",
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("admin_reset_game", args),
        "Nulstilling af spil",
      );
      if (error) {
        alert(`Kunne ikke nulstille spillet: ${error.message}`);
        return;
      }

      const payload = data as {
        ok?: boolean;
        reset_teams?: number;
        deleted_bids?: number;
        reset_players?: number;
        reset_state_rows?: number;
        error?: string;
      };
      if (!payload?.ok) {
        alert(payload?.error ?? "Nulstilling fejlede.");
        return;
      }

      if (session) {
        void loadState(session.gameId);
        void loadPlayers(session.gameId);
      }
      setMessage(
        `Spillet er nulstillet (hold frigivet: ${payload.reset_teams ?? 0}, bud slettet: ${payload.deleted_bids ?? 0}, spillere nulstillet: ${payload.reset_players ?? 0}).`,
      );
      alert("Spillet er nulstillet!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ukendt fejl.";
      alert(`Kunne ikke nulstille spillet: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePlayer(row: PlayerListRow) {
    if (!session) return;
    const confirmed = window.confirm(
      `Slet spilleren "${row.name}" fra dette spil? Deres bud slettes; ejede hold frigives.`,
    );
    if (!confirmed) return;

    setDeletingId(row.id);
    setMessage(null);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("admin_delete_player", {
          p_player_id: row.id,
          p_game_id: session.gameId,
          p_admin_secret: session.adminSecret,
        }),
        "Sletning af spiller",
      );
      if (error) {
        setMessage(`Kunne ikke slette spiller: ${error.message}`);
        return;
      }
      const payload = data as { ok?: boolean; error?: string; deleted_name?: string };
      if (!payload?.ok) {
        setMessage(payload?.error ?? "Sletning fejlede.");
        return;
      }
      setMessage(`Spilleren "${payload.deleted_name ?? row.name}" er slettet.`);
      void loadPlayers(session.gameId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ukendt fejl.";
      setMessage(`Kunne ikke slette spiller: ${message}`);
    } finally {
      setDeletingId(null);
    }
  }

  function copyInviteCode() {
    if (!session) return;
    void navigator.clipboard.writeText(session.inviteCode);
    setMessage(`Kode kopieret: ${session.inviteCode}`);
  }

  async function handleAddMatch() {
    if (!session || !newMatchHome || !newMatchAway) return;
    if (newMatchHome === newMatchAway) { setMessage("Hjemme- og udehold må ikke være det samme."); return; }
    setMatchAddLoading(true);
    setMessage(null);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("admin_add_match", {
          p_game_id:      session.gameId,
          p_admin_secret: session.adminSecret,
          p_home_team:    newMatchHome,
          p_away_team:    newMatchAway,
          p_stage:        newMatchStage,
        }),
        "Tilføjelse af kamp",
      );
      if (error) { setMessage(`Fejl: ${error.message}`); return; }
      const payload = data as { ok?: boolean; error?: string };
      if (!payload?.ok) { setMessage(payload?.error ?? "Fejl ved tilføjelse."); return; }
      setNewMatchHome("");
      setNewMatchAway("");
      void loadMatches(session.gameId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ukendt fejl.");
    } finally {
      setMatchAddLoading(false);
    }
  }

  async function handleSetResult(matchId: string) {
    if (!session) return;
    const form = resultForms[matchId];
    if (!form) return;
    const homeScore = parseInt(form.home, 10);
    const awayScore = parseInt(form.away, 10);
    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      setMessage("Ugyldigt resultat — angiv hele tal ≥ 0."); return;
    }
    setResultLoading(matchId);
    setMessage(null);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("admin_set_match_result", {
          p_game_id:      session.gameId,
          p_admin_secret: session.adminSecret,
          p_match_id:     matchId,
          p_home_score:   homeScore,
          p_away_score:   awayScore,
          p_result_type:  form.type,
        }),
        "Registrering af resultat",
      );
      if (error) { setMessage(`Fejl: ${error.message}`); return; }
      const payload = data as { ok?: boolean; error?: string };
      if (!payload?.ok) { setMessage(payload?.error ?? "Fejl."); return; }
      setMessage("Resultat gemt — point genberegnet.");
      void loadMatches(session.gameId);
      void loadPlayers(session.gameId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ukendt fejl.");
    } finally {
      setResultLoading(null);
    }
  }

  async function handleRandomAssign() {
    if (!session) return;
    if (!window.confirm("Tildel alle uejede hold tilfældigt til spillerne?")) return;
    setLoading(true);
    setMessage(null);
    try {
      // Fetch unowned teams
      const { data: unowned, error: e1 } = await supabase
        .from("game_teams")
        .select("id")
        .eq("game_id", session.gameId)
        .is("owner_player_id", null);
      if (e1) { setMessage(`Fejl: ${e1.message}`); return; }
      if (!unowned || unowned.length === 0) { setMessage("Ingen ledige hold at tildele."); return; }

      const { data: playerList, error: e2 } = await supabase
        .from("players")
        .select("id")
        .eq("game_id", session.gameId);
      if (e2 || !playerList || playerList.length === 0) { setMessage("Ingen spillere at tildele til."); return; }

      // Shuffle teams
      const shuffled = [...unowned].sort(() => Math.random() - 0.5);

      // Assign round-robin
      const updates = shuffled.map((gt, i) => ({
        id: gt.id as string,
        owner_player_id: (playerList[i % playerList.length] as { id: string }).id,
      }));

      for (const u of updates) {
        await supabase.from("game_teams").update({ owner_player_id: u.owner_player_id }).eq("id", u.id);
      }

      setMessage(`${updates.length} hold tildelt tilfældigt.`);
      void loadTeamNames(session.gameId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ukendt fejl.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMatch(matchId: string) {
    if (!session) return;
    if (!window.confirm("Slet denne kamp? Point genberegnes.")) return;
    setMessage(null);
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("admin_delete_match", {
          p_game_id:      session.gameId,
          p_admin_secret: session.adminSecret,
          p_match_id:     matchId,
        }),
        "Sletning af kamp",
      );
      if (error) { setMessage(`Fejl: ${error.message}`); return; }
      const payload = data as { ok?: boolean; error?: string };
      if (!payload?.ok) { setMessage(payload?.error ?? "Fejl."); return; }
      void loadMatches(session.gameId);
      void loadPlayers(session.gameId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ukendt fejl.");
    }
  }

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030711] text-slate-100">
        <Loader2 className="size-8 animate-spin text-amber-400/80" aria-label="Indlæser" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#030711] px-4 py-10 text-slate-100">
        <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950/60 p-8 shadow-2xl shadow-blue-950/40 backdrop-blur">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-amber-300" />
            <h1 className="text-xl font-semibold tracking-tight">Opret auktionsspil</h1>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Du får en invitationskode du kan dele. Hvert spil har sin egen auktion og spillere.
          </p>
          <label htmlFor="game-label" className="mt-6 block text-xs font-medium text-slate-400">
            Navn på spillet (valgfrit)
          </label>
          <Input
            id="game-label"
            value={newGameLabel}
            onChange={(e) => setNewGameLabel(e.target.value)}
            placeholder="Fx. Fredagshygge"
            className="mt-2 h-11 border-white/15 bg-white/[0.06] text-white"
          />
          <Button
            type="button"
            className="mt-4 w-full gap-2"
            disabled={loading}
            onClick={() => void handleCreateGame()}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Opret nyt spil
          </Button>
          {message ? (
            <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {message}
            </p>
          ) : null}
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "mt-6 inline-flex w-full justify-center")}>
            Til forsiden
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030711] px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950/60 p-8 shadow-2xl shadow-blue-950/40 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-amber-300" />
            <h1 className="text-xl font-semibold tracking-tight">Auktion Admin</h1>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => handleLeaveAdmin()}>
            Skift spil
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-200/80">
            Invitationskode
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="text-lg font-bold tracking-widest text-white">{session.inviteCode}</code>
            <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={() => copyInviteCode()}>
              <Copy className="size-3.5" />
              Kopiér
            </Button>
          </div>
          {session.label ? (
            <p className="mt-2 text-xs text-slate-400">Spil: {session.label}</p>
          ) : null}
        </div>

        <p className="mt-3 text-sm text-slate-400">
          Del koden med spillere — de indtaster den på forsiden sammen med deres navn.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button onClick={() => void handleDrawNextTeam()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Træk næste hold
          </Button>
          <Button onClick={() => void handleReveal()} disabled={loading} variant="secondary">
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Afslør og find vinder
          </Button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Button
            onClick={() => void handleRandomAssign()}
            disabled={loading}
            variant="secondary"
            className="w-full gap-2"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            🎲 Tildel resterende hold
          </Button>
          <Button
            onClick={() => void handleResetGame()}
            disabled={loading}
            variant="destructive"
            className="w-full"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Nulstil dette spil
          </Button>
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
          <h2 className="text-sm font-semibold text-white">Spillere i dette spil</h2>
          {playersLoading ? (
            <div className="mt-4 flex justify-center py-6">
              <Loader2 className="size-6 animate-spin text-amber-400/80" aria-label="Indlæser spillere" />
            </div>
          ) : players.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">Ingen spillere endnu.</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {players.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-white">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.coins.toLocaleString("da-DK")} mønter
                      {p.created_at ? (
                        <>
                          {" "}
                          ·{" "}
                          {new Date(p.created_at).toLocaleString("da-DK", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="shrink-0 gap-1"
                    disabled={loading || deletingId !== null}
                    onClick={() => void handleDeletePlayer(p)}
                  >
                    {deletingId === p.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" aria-hidden />
                    )}
                    Slet
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
          <p className="text-slate-400">
            Status: <span className="text-white">{state?.status ?? "ukendt"}</span>
          </p>
          <p className="mt-1 text-slate-400">
            Hold: <span className="text-white">{state?.current_team_name ?? "—"}</span>
          </p>
          <p className="mt-1 text-slate-400">
            Fase: <span className="text-white">{state?.current_phase ?? 0}</span>
          </p>
          <p className="mt-1 text-slate-400">
            Tie-break min bud:{" "}
            <span className="text-white">{state?.tie_break_min_bid ?? "—"}</span>
          </p>
        </div>

        {message ? (
          <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </p>
        ) : null}

        <Link href="/auction" className={cn(buttonVariants({ variant: "outline" }), "mt-6 inline-flex w-full justify-center")}>
          Til spiller-visning (samme spil som denne browser er vært for)
        </Link>

        {/* ── Kampresultater ─────────────────────────────────────────── */}
        <div className="mt-8 rounded-xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-amber-300" aria-hidden />
            <h2 className="text-sm font-semibold text-white">Kampresultater</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Tilføj kampe manuelt og registrér resultater. Point genberegnes automatisk.
          </p>

          {/* Tilføj ny kamp */}
          <div className="mt-4 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs font-medium text-slate-400">Tilføj kamp</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Hjemmehold</label>
                {teamNames.length > 0 ? (
                  <select
                    value={newMatchHome}
                    onChange={(e) => setNewMatchHome(e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/15 bg-white/[0.06] px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                  >
                    <option value="">Vælg hold</option>
                    {teamNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <Input
                    value={newMatchHome}
                    onChange={(e) => setNewMatchHome(e.target.value)}
                    placeholder="Holdnavn"
                    className="mt-1 h-9 border-white/15 bg-white/[0.06] text-white text-sm"
                  />
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500">Udehold</label>
                {teamNames.length > 0 ? (
                  <select
                    value={newMatchAway}
                    onChange={(e) => setNewMatchAway(e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/15 bg-white/[0.06] px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                  >
                    <option value="">Vælg hold</option>
                    {teamNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <Input
                    value={newMatchAway}
                    onChange={(e) => setNewMatchAway(e.target.value)}
                    placeholder="Holdnavn"
                    className="mt-1 h-9 border-white/15 bg-white/[0.06] text-white text-sm"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500">Fase</label>
              <select
                value={newMatchStage}
                onChange={(e) => setNewMatchStage(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/15 bg-white/[0.06] px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                {Object.entries(STAGE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full gap-1"
              disabled={matchAddLoading || !newMatchHome || !newMatchAway}
              onClick={() => void handleAddMatch()}
            >
              {matchAddLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Tilføj kamp
            </Button>
          </div>

          {/* Kampiste med resultat-forms */}
          <div className="mt-4 space-y-2">
            {matchesLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-5 animate-spin text-amber-400/80" />
              </div>
            ) : matches.length === 0 ? (
              <p className="py-2 text-xs text-slate-500">Ingen kampe tilføjet endnu.</p>
            ) : (
              matches.map((m) => {
                const form = resultForms[m.id] ?? { home: "", away: "", type: m.stage === "group" ? "normal_time" : "normal_time" };
                const isFinished = m.status === "finished";
                const isKnockout = m.stage !== "group";
                return (
                  <div key={m.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {m.home_team} <span className="text-slate-500">vs</span> {m.away_team}
                        </p>
                        <p className="text-xs text-slate-500">{STAGE_LABELS[m.stage] ?? m.stage}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isFinished && (
                          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                            {m.home_score}–{m.away_score}
                            {m.result_type && m.result_type !== "normal_time"
                              ? ` (${RESULT_TYPE_LABELS[m.result_type]})`
                              : ""}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDeleteMatch(m.id)}
                          className="text-slate-600 hover:text-red-400"
                          aria-label="Slet kamp"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {!isFinished && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={form.home}
                            onChange={(e) => setResultForms((prev) => ({ ...prev, [m.id]: { ...form, home: e.target.value } }))}
                            className="h-8 w-14 border-white/15 bg-white/[0.06] text-center text-sm text-white"
                          />
                          <span className="text-slate-500">–</span>
                          <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={form.away}
                            onChange={(e) => setResultForms((prev) => ({ ...prev, [m.id]: { ...form, away: e.target.value } }))}
                            className="h-8 w-14 border-white/15 bg-white/[0.06] text-center text-sm text-white"
                          />
                        </div>
                        {isKnockout && (
                          <select
                            value={form.type}
                            onChange={(e) => setResultForms((prev) => ({ ...prev, [m.id]: { ...form, type: e.target.value } }))}
                            className="h-8 rounded-md border border-white/15 bg-white/[0.06] px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                          >
                            <option value="normal_time">Ordinær tid</option>
                            <option value="extra_time">Forlænget tid</option>
                            <option value="penalties">Straffespark</option>
                          </select>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          disabled={resultLoading === m.id || !form.home || !form.away}
                          onClick={() => void handleSetResult(m.id)}
                          className="h-8 text-xs"
                        >
                          {resultLoading === m.id ? <Loader2 className="size-3 animate-spin" /> : "Gem"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        {/* ── Slut kampresultater ─────────────────────────────────────── */}
      </div>
    </div>
  );
}
