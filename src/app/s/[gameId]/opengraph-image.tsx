import { ImageResponse } from "next/og";
import { fetchPublicStandings } from "@/lib/standings";

export const alt = "Stilling — VM 2026 Auktion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function Image({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  let data: Awaited<ReturnType<typeof fetchPublicStandings>> = null;
  try { data = await fetchPublicStandings(gameId); } catch { /* ignore */ }

  const label = data?.label ?? "VM 2026 Auktion";
  const rows = (data?.standings ?? []).slice(0, 6);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #030711 0%, #0b1733 60%, #030711 100%)",
          color: "white",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <span style={{ fontSize: 40 }}>🏆</span>
          <span style={{ fontSize: 26, letterSpacing: 8, color: "#94a3b8", textTransform: "uppercase" }}>
            Stilling
          </span>
        </div>
        <div style={{ fontSize: 64, fontWeight: 800, marginBottom: 36, color: "#fde68a" }}>{label}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rows.map((s, i) => (
            <div
              key={s.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                background: i === 0 ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: "16px 28px",
              }}
            >
              <span style={{ fontSize: 36, width: 56 }}>{MEDALS[i] ?? `${i + 1}.`}</span>
              <span style={{ fontSize: 38, fontWeight: 700, flex: 1, color: i === 0 ? "#fde68a" : "white" }}>
                {s.name}
              </span>
              <span style={{ fontSize: 30, color: "#94a3b8" }}>{s.teams} hold</span>
              <span style={{ fontSize: 40, fontWeight: 800, color: "#fbbf24", width: 200, textAlign: "right" }}>
                {s.points.toLocaleString("da-DK")} pt
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "auto", fontSize: 24, color: "#475569" }}>VM 2026 Auktion</div>
      </div>
    ),
    { ...size },
  );
}
