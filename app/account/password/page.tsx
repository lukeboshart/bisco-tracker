"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Reached from a "reset password" email link, or from the tracker's "Change password" link.
export default function SetPassword() {
  const [ready, setReady] = useState<"checking" | "yes" | "no">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setReady(data.user ? "yes" : "no"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setMsg("Use a password with at least 8 characters.");
    if (password !== confirm) return setMsg("The two passwords don't match.");
    setBusy(true);
    setMsg("");
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setMsg(error.message.toLowerCase().includes("different from the old")
        ? "Pick a password you haven't used here before."
        : "The password couldn't be saved. Try again.");
      setBusy(false);
      return;
    }
    window.location.href = "/";
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
            <h2>Set your password</h2>
            {ready === "checking" && <p className="note">One moment…</p>}
            {ready === "no" && (
              <p>
                This page needs a fresh reset link. <Link href="/login">Go to sign in</Link> and choose “Forgot password?”.
              </p>
            )}
            {ready === "yes" && (
              <form onSubmit={submit}>
                <label htmlFor="new-password">
                  New password
                  <input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                <label htmlFor="confirm-password">
                  Type it again
                  <input id="confirm-password" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </label>
                <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
              </form>
            )}
            {msg && <p className="note" role="status">{msg}</p>}
          </section>
        </div>
      </main>
    </>
  );
}
