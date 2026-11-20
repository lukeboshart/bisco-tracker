"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "link" | "forgot";

const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on";

function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "That email and password don't match. If you've only signed in with email links before, use “Forgot password?” to set a password.";
  if (m.includes("email not confirmed")) return "Confirm your email first. Check your inbox for the confirmation link.";
  if (m.includes("rate limit")) return "Too many emails were sent recently. Wait a little while and try again.";
  if (m.includes("password should be")) return "Use a password with at least 8 characters.";
  return message;
}

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err === "browser")
      setMsg("That link was opened in a different browser than the one that asked for it. Your email is confirmed, so sign in below.");
    else if (err) setMsg("That link expired or was already used. Ask for a new one below.");
  }, []);

  const origin = () => window.location.origin;
  const switchTo = (m: Mode) => { setMode(m); setMsg(""); setSent(""); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");
    const supabase = createClient();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/";
        return;
      }
      if (mode === "signup") {
        if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: `${origin()}/` },
        });
        if (error) throw error;
        if (data.session) { window.location.href = "/"; return; }
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          throw new Error("There's already an account with this email. Sign in, or use “Forgot password?” to set a password.");
        }
        setSent(`We sent a confirmation link to ${email}. Open it to finish creating your account.`);
      }
      if (mode === "link") {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin()}/` } });
        if (error) throw error;
        setSent(`Check ${email} for a sign-in link. It works once and expires in an hour.`);
      }
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin()}/account/password` });
        if (error) throw error;
        setSent(`If ${email} has an account, a link to set a new password is on its way.`);
      }
    } catch (err: any) {
      setMsg(friendly(err?.message || "Something went wrong. Try again."));
    }
    setBusy(false);
  }

  async function google() {
    setMsg("");
    await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${origin()}/auth/callback` } });
  }

  const title = { signin: "Sign in", signup: "Create an account", link: "Email me a sign-in link", forgot: "Set a new password" }[mode];
  const button = { signin: "Sign in", signup: "Create account", link: "Send link", forgot: "Send reset link" }[mode];
  const needsPassword = mode === "signin" || mode === "signup";

  return (
    <>
      <header>
        <div className="wrap">
          <h1><Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Bisco <span className="arrow">&gt;</span> Tracker</Link></h1>
        </div>
      </header>
      <main>
        <div className="wrap">
          <section className="panel auth">
            <h2>{title}</h2>
            {sent ? (
              <>
                <p>{sent}</p>
                <button type="button" className="ghost" onClick={() => switchTo("signin")}>Back to sign in</button>
              </>
            ) : (
              <form onSubmit={submit}>
                <label htmlFor="email">
                  Email
                  <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </label>
                {needsPassword && (
                  <label htmlFor="password">
                    Password
                    <input id="password" type="password" required minLength={mode === "signup" ? 8 : undefined}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password} onChange={(e) => setPassword(e.target.value)} />
                  </label>
                )}
                <button className="primary" type="submit" disabled={busy}>{busy ? "One moment…" : button}</button>
              </form>
            )}
            {msg && <p className="note" role="status">{msg}</p>}
            {!sent && (
              <div className="authlinks">
                {mode !== "signin" && <button type="button" className="ghost" onClick={() => switchTo("signin")}>Sign in with a password</button>}
                {mode === "signin" && <button type="button" className="ghost" onClick={() => switchTo("forgot")}>Forgot password?</button>}
                {mode !== "signup" && <button type="button" className="ghost" onClick={() => switchTo("signup")}>Create an account</button>}
                {mode !== "link" && <button type="button" className="ghost" onClick={() => switchTo("link")}>Email me a sign-in link instead</button>}
              </div>
            )}
            {GOOGLE_ON && !sent && (
              <>
                <div className="or">or</div>
                <button type="button" onClick={google}>Continue with Google</button>
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
