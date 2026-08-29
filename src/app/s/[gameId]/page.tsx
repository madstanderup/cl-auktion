import type { Metadata } from "next";
import StandingsClient from "./StandingsClient";
import { fetchPublicStandings } from "@/lib/standings";
import { CURRENT_TOURNAMENT } from "@/lib/tournaments";

type Props = { params: Promise<{ gameId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameId } = await params;
  let data: Awaited<ReturnType<typeof fetchPublicStandings>> = null;
  try { data = await fetchPublicStandings(gameId); } catch { /* ignore */ }

  if (!data) {
    return { title: `Stilling — ${CURRENT_TOURNAMENT.label} Auktion` };
  }

  const title = `${data.label} — Stilling`;
  const top = data.standings.slice(0, 3)
    .map((s, i) => `${["🥇", "🥈", "🥉"][i]} ${s.name} ${s.points} pt`)
    .join("  ·  ");
  const description = top || `Følg stillingen i ${CURRENT_TOURNAMENT.label} Auktion`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page({ params }: Props) {
  const { gameId } = await params;
  return <StandingsClient gameId={gameId} />;
}
