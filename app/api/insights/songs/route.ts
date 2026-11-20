import { NextResponse } from "next/server";
import { getSongs } from "@/lib/bip";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Performance history for up to 20 songs at a time. Signed-in visitors only.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let names: unknown;
  try {
    names = (await req.json())?.names;
  } catch {
    names = null;
  }
  if (!Array.isArray(names) || names.length === 0 || names.length > 20 || !names.every((n) => typeof n === "string" && n.length < 200)) {
    return NextResponse.json({ error: "Send 1 to 20 song names." }, { status: 400 });
  }
  try {
    const { songs, failed } = await getSongs(names as string[]);
    return NextResponse.json({ songs, failed });
  } catch {
    return NextResponse.json({ error: "BIP isn't answering right now." }, { status: 502 });
  }
}
