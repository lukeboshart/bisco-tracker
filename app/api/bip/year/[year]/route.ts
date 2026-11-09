import { NextResponse } from "next/server";
import { getYear, BipError } from "@/lib/bip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1995 || y > new Date().getFullYear() + 1) {
    return NextResponse.json({ error: "That isn't a year the Biscuits played." }, { status: 400 });
  }
  try {
    const shows = await getYear(y);
    return NextResponse.json({ shows }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    const status = e instanceof BipError ? e.status : 502;
    return NextResponse.json({ error: "BIP isn't answering right now. Try again in a minute." }, { status });
  }
}
