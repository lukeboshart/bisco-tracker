import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Tracker from "@/components/Tracker";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) return <Tracker email={user.email ?? ""} />;

  return (
    <>
      <header>
        <div className="wrap">
          <h1>Bisco <span className="arrow">&gt;</span> Tracker</h1>
          <Link className="button" href="/login">Sign in</Link>
        </div>
      </header>
      <main>
        <div className="wrap">
          <section className="hero">
            <h2>Every Biscuits show you&rsquo;ve seen, every song you&rsquo;ve heard.</h2>
            <p>
              Pick the shows you were at from any year since 1995. Setlists come in automatically from the Bisco Internet Project,
              and you get your stats: most-heard songs, favorite segues, longest gaps, and the songs you&rsquo;re still chasing.
            </p>
            <p>Inverted and dyslexic versions count properly: a song only counts as whole when you caught both halves.</p>
            <div className="cta">
              <Link className="button" href="/login">Start tracking</Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
