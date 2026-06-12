import { NextResponse } from "next/server";

const ZAFRONIX_API_KEY = "zwc_free_a414055dfd6fb1c29b4edb19";
const ZAFRONIX_URL = "https://api.zafronix.com/fifa/worldcup/v1/matches?year=2026";

async function zafronixFetch(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": ZAFRONIX_API_KEY },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId"); // fx ?matchId=2026-001

  try {
    // Hvis matchId er givet, test per-kamp endpoint
    if (matchId) {
      const urls = [
        `https://api.zafronix.com/fifa/worldcup/v1/matches/${matchId}`,
        `https://api.zafronix.com/fifa/worldcup/v1/match/${matchId}`,
        `https://api.zafronix.com/fifa/worldcup/v1/matches/${matchId}?year=2026`,
      ];
      const results: Record<string, unknown> = {};
      for (const url of urls) {
        try {
          const res = await zafronixFetch(url);
          const body = await res.text();
          let parsed: unknown;
          try { parsed = JSON.parse(body); } catch { parsed = body.slice(0, 500); }
          results[url] = { status: res.status, data: parsed };
        } catch (e) {
          results[url] = { error: String(e) };
        }
      }
      return NextResponse.json({ matchId, results });
    }

    // Standard test: hent alle kampe
    const res = await zafronixFetch(ZAFRONIX_URL);
    const status = res.status;

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({ ok: false, status, body: body.slice(0, 500) });
    }

    const json = await res.json() as unknown;
    const allMatches: Record<string,unknown>[] =
      Array.isArray(json) ? json as Record<string,unknown>[] :
      Array.isArray((json as {data?:unknown[]}).data) ? (json as {data:Record<string,unknown>[]}).data :
      Array.isArray((json as {matches?:unknown[]}).matches) ? (json as {matches:Record<string,unknown>[]}).matches :
      [];

    const finished = allMatches.find((m) => m.status === "finished");

    // Tæl bænkspillere i den afsluttede kamp
    type LineupPlayer = { starter: boolean };
    const lineups = finished?.lineups as { home?: LineupPlayer[]; away?: LineupPlayer[] } | null;
    const benchStats = lineups ? {
      homeBench: (lineups.home ?? []).filter((p) => !p.starter).length,
      awayBench: (lineups.away ?? []).filter((p) => !p.starter).length,
      homeTotal: (lineups.home ?? []).length,
      awayTotal: (lineups.away ?? []).length,
    } : null;

    return NextResponse.json({
      ok: true,
      status,
      matchCount: allMatches.length,
      sampleFields: finished ? Object.keys(finished) : [],
      finishedMatchId: finished?.id,
      benchStats,
      finishedMatchSample: finished ?? null,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
