import { NextResponse } from "next/server";

const ZAFRONIX_API_KEY = "zwc_free_a414055dfd6fb1c29b4edb19";
const ZAFRONIX_URL = "https://api.zafronix.com/fifa/worldcup/v1/matches?year=2026";

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(ZAFRONIX_URL, {
      headers: { "X-API-Key": ZAFRONIX_API_KEY },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const status = res.status;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });

    if (!res.ok) {
      const body = await res.text().catch(() => "(kunne ikke læse body)");
      return NextResponse.json({ ok: false, status, headers, body: body.slice(0, 500) });
    }

    const json = await res.json() as unknown;
    const count =
      Array.isArray(json) ? json.length :
      Array.isArray((json as {data?:unknown[]}).data) ? (json as {data:unknown[]}).data.length :
      Array.isArray((json as {matches?:unknown[]}).matches) ? (json as {matches:unknown[]}).matches.length :
      "ukendt struktur";

    const sample = Array.isArray(json) ? (json as Record<string,unknown>[])[0] :
      Array.isArray((json as {data?:unknown[]}).data) ? ((json as {data:Record<string,unknown>[]}).data)[0] :
      null;

    return NextResponse.json({
      ok: true,
      status,
      matchCount: count,
      sampleFields: sample ? Object.keys(sample) : [],
      sample,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
