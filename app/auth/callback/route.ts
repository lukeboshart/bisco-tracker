import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google sign-in (and older-style email links) return here with a one-time code.
// This only works in the same browser that started the sign-in.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") || "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/login?error=browser`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
