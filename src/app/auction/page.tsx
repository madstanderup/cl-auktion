"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gavel, Loader2, User } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLAYER_GAME_ID_KEY, PLAYER_ID_KEY } from "@/lib/player-storage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AuctionStatus = "waiting" | "bidding" | "revealed" | "tie_breaker";

type AuctionStateRow = {
  id: string;
  current_team_name: string | null;
  current_round_id: string | null;
  current_phase: number;
  tied_player_ids: string[] | null;
  tie_break_min_bid: number | null;
  status: AuctionStatus;
  updated_at: string;
  resolution_team_name: string | null;
  resolution_winner_name: string | null;
  resolution_winning_bid: number | null;
  resolution_until: string | null;
};

type PlayerRow = { id: string; name: string; coins: number };
type RoomStats = {
  teamsTotal: number;
  teamsWithoutOwner: number;
  playersTotal: number;
  bidsCurrentRound: number;
};
type PlayerOwnershipSummary = {
  playerId: string;
  playerName: string;
  coins: number;
  teams: string[];
};

export default function AuctionPage() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [playerLoading, setPlayerLoading] = useState(true);

  const [auction, setAuction] = useState<AuctionStateRow | null>(null);
  const [auctionLoading, setAuctionLoading] = useState(true);
  const [auctionFetchError, setAuctionFetchError] = useState<string | null>(null);

  const [bidAmount, setBidAmount] = useState<string>("");
  const [bidSubmitting, setBidSubmitting] = useState(false);
  const [bidSuccessMsg, setBidSuccessMsg] = useState<string | null>(null);
  const [hasBidThisPhase, setHasBidThisPhase] = useState(false);
  const [rebidOpen, setRebidOpen] = useState(false);
  const [tiedPlayerNames, setTiedPlayerNames] = useState<string[]>([]);
  const [roomStats, setRoomStats] = useState<RoomStats>({
    teamsTotal: 0,
    teamsWithoutOwner: 0,
    playersTotal: 0,
    bidsCurrentRound: 0,
  });
  const [ownershipSummary, setOwnershipSummary] = useState<PlayerOwnershipSummary[]>([]);
  const [victoryTick, setVictoryTick] = useState(0);
  const [revealedBids, setRevealedBids] = useState<{ playerName: string; amount: number }[]>([]);
  const [lastResult, setLastResult] = useState<{
    teamName: string; winnerName: string; winningBid: number;
    bids: { playerName: string; amount: number }[];
  } | null>(null);

  const prevRoundRef = useRef<{ round: string | null; phase: number } | null>(null);
  // Gemmer sidste aktive runde så vi kan hente bud selv efter round_id nulstilles
  const lastRoundRef = useRef<{ round: string; phase: number } | null>(null);
  // Bruges til at undgå dobbelt-fetch af samme runde
  const lastSavedResultRoundRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      setGameId(localStorage.getItem(PLAYER_GAME_ID_KEY));
      setPlayerId(localStorage.getItem(PLAYER_ID_KEY));
    } catch {
      setGameId(null);
      setPlayerId(null);
    }
  }, []);

  const loadPlayer = useCallback(
    async (id: string, gid: string | null) => {
      const { data, error } = await supabase
        .from("players")
        .select("id,name,coins,game_id")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        setPlayer(null);
        return;
      }
      if (gid && String(data.game_id) !== gid) {
        setPlayer(null);
        return;
      }
      setPlayer({
        id: data.id as string,
        name: data.name as string,
        coins: data.coins as number,
      });
    },
    [],
  );

  const applyAuctionRow = useCallback((row: Record<string, unknown>) => {
    setAuction({
      id: String(row.id),
      current_team_name: row.current_team_name ? String(row.current_team_name) : null,
      current_round_id: row.current_round_id ? String(row.current_round_id) : null,
      current_phase: Number(row.current_phase ?? 0),
      tied_player_ids: Array.isArray(row.tied_player_ids)
        ? (row.tied_player_ids as string[])
        : null,
      tie_break_min_bid:
        row.tie_break_min_bid != null ? Number(row.tie_break_min_bid) : null,
      status: row.status as AuctionStatus,
      updated_at: String(row.updated_at ?? ""),
      resolution_team_name: row.resolution_team_name ? String(row.resolution_team_name) : null,
      resolution_winner_name: row.resolution_winner_name ? String(row.resolution_winner_name) : null,
      resolution_winning_bid:
        row.resolution_winning_bid != null ? Number(row.resolution_winning_bid) : null,
      resolution_until: row.resolution_until != null ? String(row.resolution_until) : null,
    });
  }, []);

  const loadRoomStats = useCallback(
    async (gid: string, roundId: string | null, phase: number) => {
      const bidsBase = supabase
        .from("auction_room_bids")
        .select("*", { count: "exact", head: true })
        .eq("game_id", gid);

      const bidsQuery = roundId
        ? bidsBase.eq("round_id", roundId).eq("bid_phase", phase)
        : bidsBase.eq("id", "00000000-0000-0000-0000-000000000000");

      const [{ count: teamsTotal }, { count: teamsWithoutOwner }, { count: playersTotal }, { count: bidsCurrentRound }] =
        await Promise.all([
          supabase
            .from("game_teams")
            .select("*", { count: "exact", head: true })
            .eq("game_id", gid),
          supabase
            .from("game_teams")
            .select("*", { count: "exact", head: true })
            .eq("game_id", gid)
            .is("owner_player_id", null),
          supabase
            .from("players")
            .select("*", { count: "exact", head: true })
            .eq("game_id", gid),
          bidsQuery,
        ]);

      setRoomStats({
        teamsTotal: teamsTotal ?? 0,
        teamsWithoutOwner: teamsWithoutOwner ?? 0,
        playersTotal: playersTotal ?? 0,
        bidsCurrentRound: bidsCurrentRound ?? 0,
      });
    },
    [],
  );

  const loadOwnershipSummary = useCallback(async (gid: string) => {
    const { data: playersData } = await supabase
      .from("players")
      .select("id,name,coins")
      .eq("game_id", gid)
      .order("name", { ascending: true });

    const { data: gtRows } = await supabase
      .from("game_teams")
      .select("owner_player_id, team_id")
      .eq("game_id", gid)
      .not("owner_player_id", "is", null);

    const teamIds = [...new Set((gtRows ?? []).map((r) => String(r.team_id)))];
    const { data: teamNames } =
      teamIds.length > 0
        ? await supabase.from("teams").select("id,name").in("id", teamIds)
        : { data: [] as { id: string; name: string }[] };

    const nameByTeamId = new Map((teamNames ?? []).map((t) => [String(t.id), String(t.name)]));

    const teamsByOwner = new Map<string, string[]>();
    for (const row of gtRows ?? []) {
      if (!row.owner_player_id) continue;
      const pid = String(row.owner_player_id);
      const nm = nameByTeamId.get(String(row.team_id));
      if (!nm) continue;
      const existing = teamsByOwner.get(pid) ?? [];
      existing.push(nm);
      teamsByOwner.set(pid, existing);
    }

    const players = (playersData ?? []) as { id: string; name: string; coins: number }[];
    const summary = players.map((row) => ({
      playerId: row.id,
      playerName: row.name,
      coins: row.coins,
      teams: (teamsByOwner.get(row.id) ?? []).sort((a, b) => a.localeCompare(b, "da")),
    }));
    setOwnershipSummary(summary);
  }, []);

  // Henter bud for en afgjort runde og gemmer dem i lastResult + revealedBids.
  // Kaldes direkte fra realtime-callback så React-batching ikke kan forhindre det.
  const fetchAndSaveResult = useCallback(async (
    teamName: string,
    winnerName: string,
    winningBid: number,
    gid: string,
    roundKey: string, // round_id brugt til dedup
  ) => {
    // Undgå dobbelt-fetch for samme runde
    if (lastSavedResultRoundRef.current === roundKey) return;
    lastSavedResultRoundRef.current = roundKey;

    const roundInfo = lastRoundRef.current;
    let bidsData: { player_id: unknown; amount: unknown }[] | null = null;

    if (roundInfo) {
      const { data } = await supabase
        .from("auction_room_bids")
        .select("player_id, amount")
        .eq("game_id", gid)
        .eq("round_id", roundInfo.round)
        .eq("bid_phase", roundInfo.phase)
        .order("amount", { ascending: false });
      bidsData = data;
    } else {
      // Fallback: seneste runde i DB
      const { data: latestRound } = await supabase
        .from("auction_room_bids")
        .select("round_id, bid_phase")
        .eq("game_id", gid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestRound) {
        const { data } = await supabase
          .from("auction_room_bids")
          .select("player_id, amount")
          .eq("game_id", gid)
          .eq("round_id", String(latestRound.round_id))
          .eq("bid_phase", Number(latestRound.bid_phase))
          .order("amount", { ascending: false });
        bidsData = data;
      }
    }

    if (!bidsData?.length) return;

    const playerIds = [...new Set(bidsData.map((b) => String(b.player_id)))];
    const { data: playersData } = await supabase.from("players").select("id,name").in("id", playerIds);
    const nameById = new Map((playersData ?? []).map((p) => [String(p.id), String(p.name)]));

    const latestByPlayer = new Map<string, number>();
    for (const b of bidsData) {
      const pid = String(b.player_id);
      if (!latestByPlayer.has(pid)) latestByPlayer.set(pid, Number(b.amount));
    }

    const sortedBids = [...latestByPlayer.entries()]
      .map(([pid, amount]) => ({ playerName: nameById.get(pid) ?? "?", amount }))
      .sort((a, b) => b.amount - a.amount);

    setRevealedBids(sortedBids);
    setLastResult({ teamName, winnerName, winningBid, bids: sortedBids });
  }, []);

  useEffect(() => {
    if (!playerId || !gameId) {
      setPlayerLoading(false);
      setPlayer(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPlayerLoading(true);
      await loadPlayer(playerId, gameId);
      if (!cancelled) setPlayerLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId, gameId, loadPlayer]);

  useEffect(() => {
    if (!gameId) {
      setAuctionLoading(false);
      setAuction(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setAuctionLoading(true);
      setAuctionFetchError(null);
      const { data, error } = await supabase
        .from("auction_state")
        .select(
          "id,current_team_name,current_round_id,current_phase,tied_player_ids,tie_break_min_bid,status,updated_at,resolution_team_name,resolution_winner_name,resolution_winning_bid,resolution_until",
        )
        .eq("game_id", gameId)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (cancelled) return;
      setAuctionLoading(false);
      if (error) {
        setAuctionFetchError(error.message);
        return;
      }
      if (data?.[0]) applyAuctionRow(data[0] as Record<string, unknown>);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyAuctionRow, gameId]);

  useEffect(() => {
    if (!gameId) return;
    void loadRoomStats(gameId, auction?.current_round_id ?? null, auction?.current_phase ?? 0);
  }, [auction?.current_phase, auction?.current_round_id, gameId, loadRoomStats]);

  useEffect(() => {
    if (!gameId) return;
    void loadOwnershipSummary(gameId);
  }, [gameId, loadOwnershipSummary]);

  useEffect(() => {
    if (!gameId) return;
    // Fallback: hvis Realtime events ikke leveres for en tabel i miljøet,
    // holder vi alligevel oversigt og status friske for alle spillere.
    const interval = window.setInterval(() => {
      void loadRoomStats(gameId, auction?.current_round_id ?? null, auction?.current_phase ?? 0);
      void loadOwnershipSummary(gameId);
    }, 2500);
    return () => {
      window.clearInterval(interval);
    };
  }, [auction?.current_phase, auction?.current_round_id, gameId, loadOwnershipSummary, loadRoomStats]);

  useEffect(() => {
    if (!gameId) return;
    const channel = supabase
      .channel(`auction-state-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "auction_state",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const next = payload.new as Record<string, unknown> | null;
          if (!next || typeof next !== "object" || !("id" in next)) return;
          applyAuctionRow(next);
          // Hent bud DIREKTE fra realtime-callback (omgår React 18 batching)
          // Selv hvis admin trækker næste hold med det samme, har vi allerede sat lastResult.
          if (next.resolution_winner_name && next.resolution_team_name) {
            // Brug round_id fra den forrige aktive runde (gemt i lastRoundRef)
            // som dedup-nøgle — eller timestamp hvis ref er null
            const dedupKey = lastRoundRef.current?.round ?? String(next.resolution_until ?? Date.now());
            void fetchAndSaveResult(
              String(next.resolution_team_name),
              String(next.resolution_winner_name),
              Number(next.resolution_winning_bid ?? 0),
              gameId,
              dedupKey,
            );
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyAuctionRow, fetchAndSaveResult, gameId]);

  useEffect(() => {
    if (!gameId) return;
    const channel = supabase
      .channel(`auction-room-stats-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void loadRoomStats(gameId, auction?.current_round_id ?? null, auction?.current_phase ?? 0);
          void loadOwnershipSummary(gameId);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_teams",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void loadRoomStats(gameId, auction?.current_round_id ?? null, auction?.current_phase ?? 0);
          void loadOwnershipSummary(gameId);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "auction_room_bids",
          filter: `game_id=eq.${gameId}`,
        },
        () => void loadRoomStats(gameId, auction?.current_round_id ?? null, auction?.current_phase ?? 0),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [auction?.current_phase, auction?.current_round_id, gameId, loadOwnershipSummary, loadRoomStats]);

  const isTiedPlayer = useMemo(() => {
    if (!playerId || !auction?.tied_player_ids) return false;
    return auction.tied_player_ids.includes(playerId);
  }, [auction?.tied_player_ids, playerId]);

  const minBid = useMemo(() => {
    if (!auction) return 0;
    if (auction.status === "tie_breaker") return Math.max(auction.tie_break_min_bid ?? 0, 0);
    return 0;
  }, [auction]);

  useEffect(() => {
    const tiedIds = auction?.tied_player_ids;
    if (!tiedIds?.length || !gameId) {
      setTiedPlayerNames([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("players")
        .select("name")
        .eq("game_id", gameId)
        .in("id", tiedIds);
      if (!cancelled) setTiedPlayerNames((data ?? []).map((r) => String(r.name)));
    })();
    return () => {
      cancelled = true;
    };
  }, [auction?.tied_player_ids, gameId]);

  useEffect(() => {
    if (!auction) return;
    // Gem aktiv runde ALTID (også ved første render) så bud-fetch kan finde den
    if (auction.current_round_id) {
      lastRoundRef.current = { round: auction.current_round_id, phase: auction.current_phase };
    }
    const prev = prevRoundRef.current;
    if (!prev) {
      prevRoundRef.current = { round: auction.current_round_id, phase: auction.current_phase };
      return;
    }
    if (prev.round !== auction.current_round_id || prev.phase !== auction.current_phase) {
      setHasBidThisPhase(false);
      setRebidOpen(false);
      setBidSuccessMsg(null);
      setBidAmount("");
      // Opdater møntbalancen når runden skifter (vinderen har fået fratrukket mønter i DB)
      if (player?.id && gameId) void loadPlayer(player.id, gameId);
    }
    prevRoundRef.current = { round: auction.current_round_id, phase: auction.current_phase };
  }, [auction, player?.id, gameId, loadPlayer]);

  useEffect(() => {
    if (!player?.id || !auction?.current_round_id || !gameId) return;
    if (!(auction.status === "bidding" || (auction.status === "tie_breaker" && isTiedPlayer))) {
      setHasBidThisPhase(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("auction_room_bids")
        .select("id")
        .eq("game_id", gameId)
        .eq("player_id", player.id)
        .eq("round_id", auction.current_round_id)
        .eq("bid_phase", auction.current_phase)
        .limit(1);
      if (!cancelled) {
        const hasBid = Boolean(data?.length);
        setHasBidThisPhase(hasBid);
        if (hasBid) setBidSuccessMsg("Bud afgivet! Venter på de andre…");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auction?.current_phase, auction?.current_round_id, auction?.status, gameId, isTiedPlayer, player?.id]);

  const victoryBannerActive = useMemo(() => {
    if (!auction?.resolution_winner_name || !auction.resolution_until) return false;
    return new Date(auction.resolution_until).getTime() > Date.now();
  }, [auction?.resolution_until, auction?.resolution_winner_name, victoryTick]);

  useEffect(() => {
    if (!auction?.resolution_until || !auction.resolution_winner_name) return;
    const end = new Date(auction.resolution_until).getTime();
    if (end <= Date.now()) return;
    const id = window.setInterval(() => setVictoryTick((x) => x + 1), 250);
    return () => window.clearInterval(id);
  }, [auction?.resolution_until, auction?.resolution_winner_name]);

  // Hent alle bud når vinder-banneret vises
  useEffect(() => {
    if (!victoryBannerActive || !gameId) return;
    const roundInfo = lastRoundRef.current;
    let cancelled = false;
    (async () => {
      let bidsData: { player_id: unknown; amount: unknown }[] | null = null;

      if (roundInfo) {
        // Vi kender runden — hent præcis de bud
        const { data } = await supabase
          .from("auction_room_bids")
          .select("player_id, amount")
          .eq("game_id", gameId)
          .eq("round_id", roundInfo.round)
          .eq("bid_phase", roundInfo.phase)
          .order("amount", { ascending: false });
        bidsData = data;
      } else {
        // Siden blev åbnet mens banneret allerede var aktivt — hent seneste runde
        const { data: latestRound } = await supabase
          .from("auction_room_bids")
          .select("round_id, bid_phase")
          .eq("game_id", gameId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestRound) {
          const { data } = await supabase
            .from("auction_room_bids")
            .select("player_id, amount")
            .eq("game_id", gameId)
            .eq("round_id", String(latestRound.round_id))
            .eq("bid_phase", Number(latestRound.bid_phase))
            .order("amount", { ascending: false });
          bidsData = data;
        }
      }

      if (!bidsData?.length) return;

      const playerIds = [...new Set(bidsData.map((b) => String(b.player_id)))];
      const { data: playersData } = await supabase
        .from("players")
        .select("id,name")
        .in("id", playerIds);

      const nameById = new Map((playersData ?? []).map((p) => [String(p.id), String(p.name)]));

      // Seneste bud pr. spiller (højest ved flere bud fra samme)
      const latestByPlayer = new Map<string, number>();
      for (const b of bidsData) {
        const pid = String(b.player_id);
        if (!latestByPlayer.has(pid)) latestByPlayer.set(pid, Number(b.amount));
      }

      const sortedBids = [...latestByPlayer.entries()]
        .map(([pid, amount]) => ({ playerName: nameById.get(pid) ?? "?", amount }))
        .sort((a, b) => b.amount - a.amount);

      // Opdater kun den levende banner hvis vi stadig er aktive
      if (!cancelled) setRevealedBids(sortedBids);

      // Gem resultatet persistent — sættes ALTID, selv hvis banneret allerede er forsvundet
      // (auction er fanget i closure fra det render hvor effekten kørte — har stadig resolution-data)
      if (auction?.resolution_team_name && auction.resolution_winner_name) {
        setLastResult({
          teamName: auction.resolution_team_name,
          winnerName: auction.resolution_winner_name,
          winningBid: auction.resolution_winning_bid ?? 0,
          bids: sortedBids,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [victoryBannerActive, gameId, auction?.resolution_team_name, auction?.resolution_winner_name, auction?.resolution_winning_bid]);

  const victorySecondsLeft = useMemo(() => {
    if (!auction?.resolution_until) return 0;
    return Math.max(0, Math.ceil((new Date(auction.resolution_until).getTime() - Date.now()) / 1000));
  }, [auction?.resolution_until, victoryTick]);

  async function handleSubmitBid() {
    if (!player || !auction || !gameId) return;
    const status = auction.status;
    if (status !== "bidding" && status !== "tie_breaker") return;
    if (status === "tie_breaker" && !isTiedPlayer) return;
    const team = auction.current_team_name?.trim();
    if (!team || !auction.current_round_id) {
      alert("Der er ingen aktiv runde at byde i.");
      return;
    }

    const amount = Number.parseInt(bidAmount.trim(), 10);
    if (!Number.isFinite(amount) || amount < minBid || amount < 0) {
      alert(`Indtast et heltal på mindst ${minBid}.`);
      return;
    }
    if (amount > player.coins) {
      alert("Du har ikke nok mønter.");
      return;
    }

    setBidSubmitting(true);
    const { error } = await supabase.from("auction_room_bids").insert({
      game_id: gameId,
      player_id: player.id,
      team_name: team,
      amount,
      round_id: auction.current_round_id,
      bid_phase: auction.current_phase,
    });
    setBidSubmitting(false);
    if (error) {
      alert(error.message);
      return;
    }
    setHasBidThisPhase(true);
    setRebidOpen(false);
    setBidSuccessMsg(
      rebidOpen ? "Bud opdateret — seneste bud tæller. Venter på de andre…" : "Bud afgivet! Venter på de andre…",
    );
    setBidAmount("");
    await loadPlayer(player.id, gameId);
  }

  const mayBidThisRound =
    auction &&
    (auction.status === "bidding" || (auction.status === "tie_breaker" && isTiedPlayer)) &&
    Boolean(auction.current_team_name) &&
    Boolean(auction.current_round_id);

  const canBid =
    mayBidThisRound && (!hasBidThisPhase || rebidOpen) && Boolean(player);

  const canShowRebidButton =
    mayBidThisRound && hasBidThisPhase && !rebidOpen && Boolean(player);
  const status = auction?.status ?? "waiting";

  const auctionFinished = roomStats.teamsTotal > 0 && roomStats.teamsWithoutOwner === 0;
  const canHaveRoundBids = status === "bidding" || status === "tie_breaker";
  const allBidsSubmitted =
    canHaveRoundBids &&
    roomStats.playersTotal > 0 &&
    roomStats.bidsCurrentRound >= roomStats.playersTotal;

  if (!gameId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030711] px-6 text-slate-100">
        <p className="max-w-md text-center text-slate-400">
          Ingen aktiv auktion valgt. Gå til forsiden og tilslut med invitationskode fra værten.
        </p>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
          Til forsiden
        </Link>
      </div>
    );
  }

  if (!playerLoading && !playerId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030711] px-6 text-slate-100">
        <p className="text-center text-slate-400">Ingen spiller fundet. Opret dig fra forsiden.</p>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
          Til forsiden
        </Link>
      </div>
    );
  }

  if (!playerLoading && playerId && !player) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030711] px-6 text-slate-100">
        <p className="max-w-md text-center text-slate-400">
          Kunne ikke hente spilleren. Tjek at ID i browseren matcher databasen, eller opret dig igen.
        </p>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
          Til forsiden
        </Link>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#030711] text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(59,130,246,0.18),transparent_50%)]"
        aria-hidden
      />

      <header className="relative z-10 border-b border-white/[0.08] bg-slate-950/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
              <Gavel className="size-5" aria-hidden />
            </div>
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">Auktionsrum</p>
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                <User className="size-4 text-slate-400" aria-hidden />
                {playerLoading ? "…" : (player?.name ?? "—")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {gameId && (
              <Link
                href={`/game/${gameId}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-white/20 text-xs text-slate-200")}
              >
                ← Spil
              </Link>
            )}
            {gameId && (
              <Link
                href={`/game/${gameId}/points`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-amber-400/30 text-xs text-amber-200/90")}
              >
                Pointoversigt
              </Link>
            )}
            <div className="flex items-baseline gap-2 rounded-xl border border-white/[0.08] bg-black/25 px-4 py-2">
              <span className="text-xs uppercase tracking-wider text-slate-500">Mønter</span>
              <span className="text-lg font-semibold tabular-nums text-amber-200">
                {playerLoading ? "…" : (player?.coins.toLocaleString("da-DK") ?? "—")}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-4 py-12 sm:px-6">
        {victoryBannerActive && auction ? (
          <div
            className="mb-4 w-full rounded-2xl border border-amber-400/40 bg-gradient-to-b from-amber-500/20 to-amber-950/40 px-5 py-5 text-center shadow-lg shadow-amber-950/30"
            role="status"
            aria-live="polite"
          >
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-amber-200/90">Vinder</p>
            <p className="mt-2 text-lg font-bold text-white">
              {auction.resolution_team_name ?? "Hold"}
            </p>
            <p className="mt-3 text-sm text-slate-200">
              Går til{" "}
              <span className="font-semibold text-amber-100">{auction.resolution_winner_name}</span>
              {" · "}
              <span className="tabular-nums text-amber-200">
                {(auction.resolution_winning_bid ?? 0).toLocaleString("da-DK")} mønter
              </span>
            </p>

            {revealedBids.length > 0 && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left">
                <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-slate-500">Alle bud</p>
                <ul className="space-y-1">
                  {revealedBids.map((b) => (
                    <li key={b.playerName} className="flex items-center justify-between text-sm">
                      <span className={cn(
                        "font-medium",
                        b.playerName === auction.resolution_winner_name ? "text-amber-200" : "text-slate-300"
                      )}>
                        {b.playerName === auction.resolution_winner_name ? "👑 " : ""}{b.playerName}
                      </span>
                      <span className="tabular-nums text-slate-200">{b.amount.toLocaleString("da-DK")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-3 text-xs text-slate-400">
              Vises i <span className="tabular-nums font-medium text-amber-200/90">{victorySecondsLeft}</span> sek.
              endnu
            </p>
          </div>
        ) : null}

        {/* Seneste resultat — vises persistent indtil næste resultat erstatter det */}
        {!victoryBannerActive && lastResult && lastResult.bids.length > 0 && (
          <div className="mb-4 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-4">
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-500 mb-2">Seneste resultat</p>
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-white">{lastResult.teamName}</span>
              <span className="text-sm text-slate-300">
                → <span className="font-semibold text-amber-200">{lastResult.winnerName}</span>
                <span className="ml-2 tabular-nums text-amber-300/80">{lastResult.winningBid.toLocaleString("da-DK")} 🪙</span>
              </span>
            </div>
            {lastResult.bids.length > 0 && (
              <ul className="space-y-1 border-t border-white/[0.07] pt-2">
                {lastResult.bids.map((b) => (
                  <li key={b.playerName} className="flex items-center justify-between text-sm">
                    <span className={cn(
                      "font-medium",
                      b.playerName === lastResult.winnerName ? "text-amber-200" : "text-slate-400"
                    )}>
                      {b.playerName === lastResult.winnerName ? "👑 " : ""}{b.playerName}
                    </span>
                    <span className={cn(
                      "tabular-nums",
                      b.playerName === lastResult.winnerName ? "font-bold text-amber-200" : "text-slate-500"
                    )}>{b.amount.toLocaleString("da-DK")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {auctionFinished ? (
          <div className="mb-4 w-full rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-emerald-200">
              Auktionen er slut. Held og lykke med spillet!
            </p>
          </div>
        ) : null}

        <section className="mb-4 grid w-full grid-cols-2 gap-2 rounded-xl border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-300 sm:grid-cols-4">
          <div className="rounded-md border border-white/10 bg-black/20 p-2">
            <p className="text-slate-500">Hold i alt</p>
            <p className="text-lg font-semibold tabular-nums text-white">{roomStats.teamsTotal}</p>
          </div>
          <div
            className={cn(
              "rounded-md border p-2",
              auctionFinished
                ? "border-red-400/40 bg-red-500/10"
                : "border-white/10 bg-black/20",
            )}
          >
            <p className="text-slate-500">Ledige hold</p>
            <p
              className={cn(
                "text-lg font-semibold tabular-nums",
                auctionFinished ? "text-red-200" : "text-amber-200",
              )}
            >
              {roomStats.teamsWithoutOwner}
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-black/20 p-2">
            <p className="text-slate-500">Spillere</p>
            <p className="text-lg font-semibold tabular-nums text-white">{roomStats.playersTotal}</p>
          </div>
          <div
            className={cn(
              "rounded-md border p-2",
              allBidsSubmitted
                ? "border-emerald-400/40 bg-emerald-500/10"
                : "border-white/10 bg-black/20",
            )}
          >
            <p className="text-slate-500">Bud (runde)</p>
            <p
              className={cn(
                "text-lg font-semibold tabular-nums",
                allBidsSubmitted ? "text-emerald-200" : "text-slate-100",
              )}
            >
              {roomStats.bidsCurrentRound}
            </p>
          </div>
        </section>

        <section className="mb-6 w-full rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-white">Holdoversigt</h2>
            <span className="text-xs text-slate-400">Live opdatering</span>
          </div>

          {ownershipSummary.length === 0 ? (
            <p className="text-sm text-slate-400">Ingen spillere fundet endnu.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {ownershipSummary.map((entry) => (
                <article
                  key={entry.playerId}
                  className="rounded-xl border border-white/10 bg-black/25 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{entry.playerName}</p>
                      <p className="text-xs text-slate-400">
                        {entry.coins.toLocaleString("da-DK")} mønter tilbage
                      </p>
                    </div>
                    <span className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-200">
                      {entry.teams.length} hold
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.teams.length ? (
                      entry.teams.map((teamName) => (
                        <span
                          key={`${entry.playerId}-${teamName}`}
                          className="rounded-full border border-white/15 bg-slate-900/70 px-2.5 py-1 text-xs text-slate-200"
                        >
                          {teamName}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">Ingen hold endnu</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {(playerLoading || auctionLoading) && !auction ? (
          <Loader2 className="size-8 animate-spin text-amber-400/80" aria-label="Indlæser" />
        ) : !auction ? (
          <div className="max-w-md space-y-3 text-center text-sm text-slate-400">
            <p className="text-red-300/90">Kunne ikke læse auktionstilstand</p>
            {auctionFetchError ? (
              <p className="rounded-lg border border-white/10 bg-black/30 p-3 text-left font-mono text-xs text-slate-400 break-all">
                {auctionFetchError}
              </p>
            ) : null}
          </div>
        ) : (
          <article className={cn("w-full rounded-2xl border border-white/[0.1] bg-slate-950/60 p-8 shadow-2xl shadow-blue-950/50 backdrop-blur-md", "ring-1 ring-inset ring-white/[0.05]")}>
            {status === "waiting" && (
              <div className="text-center">
                <p className="text-sm font-medium leading-relaxed text-slate-300">
                  Venter på at auktionarius starter næste runde...
                </p>
              </div>
            )}

            {(status === "bidding" || status === "tie_breaker") && (
              <div className="text-center">
                {auction.current_team_name ? (
                  <>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-amber-400/90">
                      {status === "tie_breaker" ? "Om-auktion" : "Under hammeren"}
                    </p>
                    <h1 className="mt-3 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                      {auction.current_team_name}
                    </h1>
                  </>
                ) : null}

                {status === "tie_breaker" && !isTiedPlayer ? (
                  <p className="mt-6 text-sm text-slate-300">
                    Uafgjort! Venter på om-auktion mellem{" "}
                    <span className="font-medium text-white">
                      {tiedPlayerNames.length ? tiedPlayerNames.join(", ") : "de tiede spillere"}
                    </span>
                    ...
                  </p>
                ) : null}

                {bidSuccessMsg ? (
                  <p className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200/95" role="status">
                    {bidSuccessMsg}
                  </p>
                ) : null}

                {canShowRebidButton ? (
                  <div className="mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-white/20 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]"
                      disabled={bidSubmitting}
                      onClick={() => {
                        setRebidOpen(true);
                        setBidSuccessMsg(null);
                      }}
                    >
                      Ret mit bud
                    </Button>
                    <p className="mt-2 text-center text-xs text-slate-500">
                      Du må ændre bud indtil alle har budt og runden afsløres automatisk.
                    </p>
                  </div>
                ) : null}

                {canBid ? (
                  <div className="mt-8 space-y-4 text-left">
                    <label htmlFor="bid-amount" className="block text-xs font-medium text-slate-400">
                      Dit bud (mønter){status === "tie_breaker" ? ` — min ${minBid}` : ""}
                      {player ? (
                        <span className="ml-2 text-slate-500">
                          (du har {player.coins.toLocaleString("da-DK")})
                        </span>
                      ) : null}
                    </label>
                    <Input
                      id="bid-amount"
                      type="number"
                      inputMode="numeric"
                      min={minBid}
                      max={player?.coins ?? undefined}
                      placeholder={String(minBid)}
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      disabled={bidSubmitting}
                      className={cn(
                        "h-11 border-white/15 bg-white/[0.06] text-base text-white",
                        "placeholder:text-slate-500 focus-visible:border-amber-400/50 focus-visible:ring-amber-400/25",
                        player && bidAmount && Number(bidAmount) > player.coins &&
                          "border-red-400/60 focus-visible:border-red-400/70 focus-visible:ring-red-400/25",
                      )}
                    />
                    {player && bidAmount && Number(bidAmount) > player.coins ? (
                      <p className="text-xs text-red-300/90">
                        Du har ikke nok mønter — maks {player.coins.toLocaleString("da-DK")}.
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      className={cn(
                        "inline-flex h-11 w-full gap-2 text-base font-semibold",
                        "border border-amber-400/30 bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 text-slate-950",
                        "hover:from-amber-200 hover:via-amber-100 hover:to-amber-200",
                      )}
                      disabled={
                        bidSubmitting ||
                        !player ||
                        bidAmount === "" ||
                        Number(bidAmount) < minBid ||
                        Number(bidAmount) > (player?.coins ?? 0)
                      }
                      onClick={() => void handleSubmitBid()}
                    >
                      {bidSubmitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Sender...
                        </>
                      ) : (
                        "Afgiv skjult bud"
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}

            {status === "revealed" && (
              <div className="text-center">
                <p className="text-sm font-medium leading-relaxed text-slate-300">
                  Buddene er afsløret. Vent på auktionarius for næste runde.
                </p>
              </div>
            )}
          </article>
        )}
      </main>
    </div>
  );
}
