"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error"))
      setMsg("That sign-in link expired or was already used. Ask for a new one.");
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setMsg("");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("idle");
      setMsg(error.message);
    } else setState("sent");
  }

  async function google() {
    setMsg("");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setMsg("Google sign-in isn't set up yet. Use your email instead.");
  }

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
            <h2>Sign in</h2>
            {state === "sent" ? (
              <p>Check <b>{email}</b> for a sign-in link. It works once and expires in an hour.</p>
            ) : (
              <form onSubmit={sendLink}>
                <label htmlFor="email">
                  Email
                  <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </label>
                <button className="primary" type="submit" disabled={state === "sending"}>
                  {state === "sending" ? "Sending…" : "Email me a sign-in link"}
                </button>
              </form>
            )}
            <div className="or">or</div>
            <button type="button" onClick={google}>Continue with Google</button>
            {msg && <p className="note" role="status">{msg}</p>}
          </section>
        </div>
      </main>
    </>
  );
}
