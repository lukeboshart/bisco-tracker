import { NextResponse } from "next/server";
import { getSetlist, BipError } from "@/lib/bip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^\d{4}-\d{2}-\d{2}[a-z0-9-]*$/i.test(slug)) {
    return NextResponse.json({ error: "Unknown show." }, { status: 400 });
  }
  try {
    const setlist = await getSetlist(slug);
    return NextResponse.json(setlist, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    if (e instanceof BipError && e.status === 404) {
      return NextResponse.json({ raw: "" });
    }
    return NextResponse.json({ error: "BIP isn't answering right now. Try again in a minute." }, { status: 502 });
  }
}
