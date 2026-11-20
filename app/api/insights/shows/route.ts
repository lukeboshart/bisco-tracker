import { NextResponse } from "next/server";
import { getAllShows } from "@/lib/bip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Every show the band has played, used to measure gaps in shows.
export async function GET() {
  try {
    const shows = await getAllShows();
    return NextResponse.json({ shows }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ error: "BIP isn't answering right now." }, { status: 502 });
  }
}
