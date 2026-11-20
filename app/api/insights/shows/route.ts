import { NextResponse } from "next/server";
import { getAllShows } from "@/lib/bip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Every show the band has played, used to measure gaps in shows.
export async function GET() {
  try {
    const { shows, missing } = await getAllShows();
    const cache = missing.length ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400";
    return NextResponse.json({ shows, missing }, { headers: { "Cache-Control": cache } });
  } catch {
    return NextResponse.json({ error: "BIP isn't answering right now." }, { status: 502 });
  }
}
