/**
 * UEFA's kamp-API for Champions League — typer og parsing.
 *
 * Ligger separat fra /api/sync-matches-cl, så mapningen kan køres og testes
 * mod rigtige API-svar uden database (scripts/cl-uefa-smoke.ts).
 */

/**
 * UEFA's runde → vores stage-keys (wc_matches.stage-constraint).
 *
 * Kun kampe med competitionPhase "TOURNAMENT" må herind: kvalifikationen har
 * sin EGEN "Play-Offs"-runde, som intet har at gøre med knockout-playoff'en
 * mellem nr. 9-24, og som ville forurene både ligatabel og point.
 *
 * Ligafasen er verificeret mod de rigtige data (navn "League Phase", type
 * "GROUP_STANDINGS"). Knockout-runderne er ikke oprettet hos UEFA endnu, så
 * navnene dér matches tolerant — ukendte runder springes over og rapporteres
 * som unknownStages i svaret, så de kan rettes uden gætværk.
 */
export function mapStage(roundName: string | undefined, roundType: string | undefined): string | null {
  if (roundType === "GROUP_STANDINGS") return "league";
  const n = (roundName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (n.includes("leaguephase")) return "league";
  if (n.includes("playoff")) return "playoff";
  if (n.includes("roundof16")) return "round_of_16";
  if (n.startsWith("quarterfinal")) return "quarter_final";
  if (n.startsWith("semifinal")) return "semi_final";
  if (n === "final") return "final";
  return null;
}

type UefaTeam = { id?: string; internationalName?: string };
type UefaScore = { home?: number; away?: number };
type UefaScorer = {
  goalType?: string;
  phase?: string;
  teamId?: string;
  time?: { minute?: number };
  player?: { internationalName?: string; clubId?: string };
};
export type UefaMatch = {
  id?: string;
  competitionPhase?: string;
  homeTeam?: UefaTeam;
  awayTeam?: UefaTeam;
  status?: string;
  kickOffTime?: { dateTime?: string; date?: string };
  round?: { metaData?: { name?: string; type?: string } };
  /** regular = efter 90 min, total = inkl. forlænget, penalty = straffesparkskonkurrence. */
  score?: { regular?: UefaScore; total?: UefaScore; aggregate?: UefaScore; penalty?: UefaScore };
  winner?: { match?: { reason?: string }; aggregate?: { reason?: string; team?: UefaTeam } };
  playerEvents?: { scorers?: UefaScorer[] };
  stadium?: {
    translations?: { name?: Record<string, string> };
    city?: { translations?: { name?: Record<string, string> } };
  };
};

/** Kampen normaliseret til præcis de felter wc_matches bruger. */
export type ParsedMatch = {
  id: string | null;
  stage: string;
  rawHome: string;
  rawAway: string;
  matchDate: string | null;
  status: "finished" | "live" | "scheduled";
  homeScore: number | null;
  awayScore: number | null;
  resultType: "normal_time" | "extra_time" | "penalties";
  winnerSide: "home" | "away" | null;
  goals: { minute: number; team: "home" | "away"; scorer: string }[] | null;
  stadium: string | null;
  city: string | null;
};

/**
 * UEFA-kamp → ParsedMatch. Returnerer null for runder vi ikke kender.
 *
 * Resultatfelterne: score.regular er stillingen efter 90 minutter, score.total
 * inkluderer forlænget spilletid, og score.penalty er straffesparkskonkurrencen.
 * Vi gemmer score.total som kampens resultat, fordi pointmotoren afgør en
 * forlænget-sejr på selve målscoren; straffesparkskonkurrencen kan ikke aflæses
 * dér og bæres derfor af result_type + winner_side.
 */
export function parseUefaMatch(m: UefaMatch): ParsedMatch | null {
  const stage = mapStage(m.round?.metaData?.name, m.round?.metaData?.type);
  if (!stage) return null;

  const regular = m.score?.regular, total = m.score?.total ?? regular, pen = m.score?.penalty;
  const homeScore = total?.home ?? null, awayScore = total?.away ?? null;

  // Forlænget: enten står totalen anderledes end efter 90 min, eller også er
  // der scoret i forlænget. Straffe vinder over alt andet.
  const scorers = m.playerEvents?.scorers ?? [];
  const wentToExtraTime =
    (regular != null && total != null && (regular.home !== total.home || regular.away !== total.away)) ||
    scorers.some((s) => (s.phase ?? "").startsWith("EXTRA_TIME")) ||
    m.winner?.aggregate?.reason === "WIN_ON_EXTRA_TIME";
  const resultType = pen ? "penalties" : wentToExtraTime ? "extra_time" : "normal_time";

  let winnerSide: "home" | "away" | null = null;
  if (pen && pen.home != null && pen.away != null) {
    winnerSide = pen.home > pen.away ? "home" : pen.away > pen.home ? "away" : null;
  }

  const homeId = m.homeTeam?.id;
  const goals = scorers.length
    ? scorers.map((s) => {
        // Selvmål tælles for modstanderen; teamId på et selvmål kan ikke stoles
        // på, så vi går efter spillerens egen klub og vender den om.
        const own = s.goalType === "OWN";
        const scoringTeamId = own ? (s.player?.clubId === homeId ? m.awayTeam?.id : homeId) : s.teamId;
        const name = s.player?.internationalName ?? "?";
        return {
          minute: s.time?.minute ?? 0,
          team: (scoringTeamId === homeId ? "home" : "away") as "home" | "away",
          scorer: own ? `${name} (selvmål)` : name,
        };
      })
    : null;

  const status =
    m.status === "FINISHED" ? "finished"
    : m.status === "LIVE" || m.status === "PAUSED" || m.status === "HALF_TIME" ? "live"
    : "scheduled";

  let matchDate: string | null = null;
  const raw = m.kickOffTime?.dateTime ?? m.kickOffTime?.date ?? null;
  if (raw) { try { matchDate = new Date(raw).toISOString(); } catch { matchDate = null; } }

  return {
    id: m.id ?? null,
    stage,
    rawHome: (m.homeTeam?.internationalName ?? "").trim(),
    rawAway: (m.awayTeam?.internationalName ?? "").trim(),
    matchDate,
    status,
    homeScore,
    awayScore,
    resultType,
    winnerSide,
    goals,
    stadium: m.stadium?.translations?.name?.EN ?? null,
    city: m.stadium?.city?.translations?.name?.EN ?? null,
  };
}
