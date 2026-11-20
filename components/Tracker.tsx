"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CATALOG, computeStats, fmtDate, parseSetlist, songCount, stubDate,
  type DirectoryShow, type Show,
} from "@/lib/setlist";

type View = "stats" | "shows" | "add";
type Draft = { id?: string; date: string; venue: string; city: string; raw: string; slug: string | null };
type YearState = { status: "loading" | "ok" | "error"; rows?: DirectoryShow[]; error?: string };

const VIEWS: View[] = ["stats", "shows", "add"];
const fromRow = (r: any): Show => ({
  id: r.id, date: r.show_date, venue: r.venue || "", city: r.city || "", raw: r.setlist || "", slug: r.bip_slug || null,
});

export default function Tracker({ email }: { email: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>("stats");
  const [shows, setShows] = useState<Show[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  // Hash routing: #stats, #shows, #add
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as View;
      setView(VIEWS.includes(h) ? h : "stats");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = (v: View) => {
    setDraft(null);
    window.location.hash = v;
    window.scrollTo(0, 0);
  };

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("user_shows").select("*").order("show_date", { ascending: false });
    if (error) setNotice("Your shows couldn't be loaded. Refresh the page to try again.");
    else {
      setShows((data || []).map(fromRow));
      setNotice("");
    }
    setLoaded(true);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function save(d: Draft) {
    const row = { show_date: d.date, venue: d.venue, city: d.city, setlist: d.raw, bip_slug: d.slug };
    const res = d.id
      ? await supabase.from("user_shows").update(row).eq("id", d.id).select().single()
      : await supabase.from("user_shows").insert(row).select().single();
    if (res.error) {
      if (res.error.code === "23505") throw new Error("You've already logged this show.");
      throw new Error("The show couldn't be saved. Check your connection and try again.");
    }
    const saved = fromRow(res.data);
    setShows((list) => [saved, ...list.filter((s) => s.id !== saved.id)]);
  }
  async function remove(id: string) {
    const { error } = await supabase.from("user_shows").delete().eq("id", id);
    if (error) setNotice("That show couldn't be deleted. Try again in a moment.");
    else setShows((list) => list.filter((s) => s.id !== id));
  }
  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <>
      <header>
        <div className="wrap">
          <h1>Bisco <span className="arrow">&gt;</span> Tracker</h1>
          <nav aria-label="Sections">
            {VIEWS.map((v) => (
              <button key={v} type="button" aria-current={view === v ? "page" : undefined} onClick={() => go(v)}>
                {v === "stats" ? "Stats" : v === "shows" ? "My shows" : "Add show"}
              </button>
            ))}
          </nav>
          <div className="who">
            <span>{email}</span>
            <a href="/account/password">Change password</a>
            <button type="button" className="ghost" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main>
        <div className="wrap">
          {notice && <p className="note">{notice}</p>}
          {!loaded ? (
            <p className="note">Loading your shows…</p>
          ) : view === "add" ? (
            draft ? (
              <ShowForm
                key={(draft.id || "") + draft.slug + draft.date}
                draft={draft}
                onSave={async (d) => { await save(d); go("shows"); }}
                onBack={() => setDraft(null)}
                onCancel={() => go("shows")}
              />
            ) : (
              <Picker
                shows={shows}
                onPick={(d) => { setDraft(d); window.scrollTo(0, 0); }}
              />
            )
          ) : shows.length === 0 ? (
            <section className="panel empty">
              <h2>No shows yet</h2>
              <p>Pick a year, tap the shows you were at, and your stats build themselves.</p>
              <button className="primary" type="button" onClick={() => go("add")}>Add your first show</button>
            </section>
          ) : view === "stats" ? (
            <Stats shows={shows} />
          ) : (
            <MyShows shows={shows} onEdit={(s) => { go("add"); setDraft({ ...s }); }} onDelete={remove} />
          )}
        </div>
      </main>
    </>
  );
}

/* ---------------- Stats ---------------- */

function Stats({ shows }: { shows: Show[] }) {
  const st = useMemo(() => computeStats(shows), [shows]);
  const [query, setQuery] = useState("");
  const [openSong, setOpenSong] = useState<string | null>(null);
  const top = st.list.slice(0, 10), max = top[0] ? top[0].shows : 1;
  const pieces = st.list.filter((s) => s.whole === 0).slice(0, 8);
  const gaps = st.list.filter((s) => s.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 6);
  const chase = CATALOG.filter((s) => !st.heard.has(s.toLowerCase()));
  const ymax = Math.max(1, ...st.years.map((y) => y[1]));
  const rows = st.list.filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <div className="figures">
        <div><b>{st.count}</b><span>shows</span></div>
        <div><b>{st.list.length}</b><span>different songs</span></div>
        <div><b>{st.performances}</b><span>songs heard in total</span></div>
        <div><b>{st.venues}</b><span>venues</span></div>
      </div>
      <div className="grid">
        <section className="panel">
          <h3>Most heard</h3>
          <ol className="bars">
            {top.map((s) => (
              <li key={s.name}>
                <span className="name">{s.name}</span><span className="mono">{s.shows}</span>
                <span className="track">
                  <span className="full" style={{ width: `${(s.whole / max) * 100}%` }} />
                  <span className="part" style={{ width: `${(s.partOnly / max) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
          <div className="legend"><span><i />Full version</span><span><i className="p" />Only part of it</span></div>
        </section>
        <section className="panel">
          <h3>Favorite transitions</h3>
          {st.segues.length ? (
            <ul className="plain">
              {st.segues.slice(0, 6).map(([k, n]) => {
                const [a, b] = k.split("|");
                return <li key={k}><span>{a} <span className="seg">&gt;</span> {b}</span><span className="mono">×{n}</span></li>;
              })}
            </ul>
          ) : <p className="note">Segues you&rsquo;ve heard show up here.</p>}
          <h3 style={{ marginTop: 18 }}>Shows per year</h3>
          <div className="years">
            {st.years.map(([y, n]) => (
              <div key={y}><em>{n}</em><span className="b" style={{ height: `${(n / ymax) * 70}px` }} /><small>{y}</small></div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h3>Only heard in pieces</h3>
          {pieces.length ? (
            <>
              <ul className="plain">
                {pieces.map((s) => <li key={s.name}><span>{s.name}</span><span className="mono">{s.partOnly}× partial</span></li>)}
              </ul>
              <p className="note" style={{ margin: "10px 0 0" }}>An inverted or unfinished song counts as whole when both halves land in the same show.</p>
            </>
          ) : <p className="note">You&rsquo;ve heard a full version of everything you&rsquo;ve caught.</p>}
        </section>
        <section className="panel">
          <h3>Longest gaps</h3>
          {gaps.length ? (
            <ul className="plain">
              {gaps.map((s) => <li key={s.name}><span>{s.name}</span><span className="mono">{s.gap} show{s.gap > 1 ? "s" : ""} ago</span></li>)}
            </ul>
          ) : <p className="note">Gaps appear once you&rsquo;ve logged a few shows.</p>}
        </section>
      </div>
      <section className="panel">
        <h3>Chase list · {chase.length} not caught yet</h3>
        <div className="chips">{chase.map((s) => <span key={s} className="chip">{s}</span>)}</div>
        <p className="note" style={{ margin: "10px 0 0" }}>Checked against a starter list of {CATALOG.length} songs.</p>
      </section>
      <section className="panel">
        <h3>Every song you&rsquo;ve heard</h3>
        <input className="search" id="songsearch" type="search" placeholder="Search songs" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="tablebox">
          <table>
            <thead><tr><th>Song</th><th className="n">Shows</th><th className="n">Full</th><th>Last heard</th><th className="n">Gap</th></tr></thead>
            <tbody>
              {rows.length ? rows.map((s) => (
                <SongRows key={s.name} s={s} open={openSong === s.name} toggle={() => setOpenSong(openSong === s.name ? null : s.name)} />
              )) : <tr><td colSpan={5} className="note">No songs match &ldquo;{query}&rdquo;.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SongRows({ s, open, toggle }: { s: any; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr className="song" onClick={toggle}>
        <td>{s.name}</td><td className="n mono">{s.shows}</td><td className="n mono">{s.whole}</td>
        <td className="mono">{fmtDate(s.last)}</td><td className="n mono">{s.gap}</td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={5}>
            {s.dates.map((d: any, i: number) => (
              <span key={d.date + i}>
                {i > 0 && " · "}{fmtDate(d.date)}
                {d.status === "partial" && <span className="tag part">partial</span>}
                {d.status === "pieced" && <span className="tag pieced">pieced together</span>}
              </span>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

/* ---------------- My shows ---------------- */

function SetlistView({ raw }: { raw: string }) {
  const sets = parseSetlist(raw);
  if (!sets.length) return <p className="note">No songs yet.</p>;
  return (
    <>
      {sets.map((set, si) => (
        <p key={si}>
          <span className="lbl">{set.label}</span>
          {set.songs.map((s, i) => (
            <span key={i}>
              {s.name}
              {s.partial && <span className="tag part">{s.partial}</span>}
              {i < set.songs.length - 1 && (s.segue ? <> <span className="sep s">&gt;</span> </> : <><span className="sep">,</span> </>)}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

function MyShows({ shows, onEdit, onDelete }: { shows: Show[]; onEdit: (s: Show) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const list = [...shows].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="stubs">
      {list.map((sh) => {
        const d = stubDate(sh.date);
        return (
          <article className="stub" key={sh.id}>
            <div className="date"><span>{d.mon}</span><b>{d.day}</b><span>{d.yr}</span></div>
            <div className="info">
              <div className="venue">{sh.venue || "Unknown venue"}</div>
              <div className="meta">{sh.city}{sh.city ? " · " : ""}{songCount(sh.raw)} songs</div>
              {open === sh.id && <div className="setlist"><SetlistView raw={sh.raw} /></div>}
              <div className="actions">
                <button className="ghost" type="button" onClick={() => setOpen(open === sh.id ? null : sh.id)}>
                  {open === sh.id ? "Hide setlist" : "Show setlist"}
                </button>
                {confirm === sh.id ? (
                  <>
                    <span className="note">Delete this show?</span>
                    <button className="danger" type="button" onClick={() => { setConfirm(null); onDelete(sh.id); }}>Delete</button>
                    <button className="ghost" type="button" onClick={() => setConfirm(null)}>Keep</button>
                  </>
                ) : (
                  <>
                    <button className="ghost" type="button" onClick={() => onEdit(sh)}>Edit</button>
                    <button className="ghost" type="button" onClick={() => setConfirm(sh.id)}>Delete</button>
                  </>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ---------------- Picker ---------------- */

function Picker({ shows, onPick }: { shows: Show[]; onPick: (d: Draft) => void }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [query, setQuery] = useState("");
  const [years, setYears] = useState<Record<number, YearState>>({});
  const barRef = useRef<HTMLDivElement>(null);

  const loadYear = useCallback(async (y: number, force = false) => {
    if (!force && years[y] && years[y].status !== "error") return;
    setYears((m) => ({ ...m, [y]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/bip/year/${y}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "BIP isn't answering right now.");
      setYears((m) => ({ ...m, [y]: { status: "ok", rows: body.shows } }));
    } catch (e: any) {
      setYears((m) => ({ ...m, [y]: { status: "error", error: e.message || "BIP isn't answering right now." } }));
    }
  }, [years]);

  useEffect(() => { loadYear(year); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    barRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [year]);

  const counts = new Map<number, number>();
  shows.forEach((s) => { const y = +s.date.slice(0, 4); counts.set(y, (counts.get(y) || 0) + 1); });
  const state = years[year];
  const logged = new Map(shows.filter((s) => s.slug).map((s) => [s.slug, s]));
  const q = query.toLowerCase();
  const rows = (state?.rows || []).filter((s) => !q || `${s.venue} ${s.city}`.toLowerCase().includes(q));
  const months = new Map<string, DirectoryShow[]>();
  rows.forEach((s) => {
    const mo = new Date(+s.date.slice(0, 4), +s.date.slice(5, 7) - 1, 1).toLocaleDateString(undefined, { month: "long" });
    if (!months.has(mo)) months.set(mo, []);
    months.get(mo)!.push(s);
  });
  const allYears: number[] = [];
  for (let y = thisYear; y >= 1995; y--) allYears.push(y);

  return (
    <section className="panel picker">
      <h2>Which show were you at?</h2>
      <div className="yearbar" role="group" aria-label="Year" ref={barRef}>
        {allYears.map((y) => (
          <button key={y} type="button" aria-pressed={y === year} onClick={() => { setYear(y); setQuery(""); }}>
            {y}{counts.get(y) ? <small>{counts.get(y)}</small> : null}
          </button>
        ))}
      </div>
      {state?.status === "loading" && <p className="note">Loading {year} shows from BIP…</p>}
      {state?.status === "error" && (
        <div className="banner"><span>{state.error}</span><button type="button" onClick={() => loadYear(year, true)}>Try again</button></div>
      )}
      <input className="search" id="pickquery" type="search" placeholder={`Filter ${year} by venue or city`} value={query} onChange={(e) => setQuery(e.target.value)} />
      {state?.status === "ok" && !rows.length && (
        <div className="empty">{query ? `No ${year} shows match “${query}”.` : `No shows listed for ${year}.`}</div>
      )}
      {[...months].map(([mo, list]) => (
        <div key={mo}>
          <h3>{mo}</h3>
          <ul className="showlist">
            {list.map((s) => {
              const mine = s.slug ? logged.get(s.slug) : undefined;
              return (
                <li key={s.slug || s.date + s.venue}>
                  <button type="button" className="showrow" onClick={() => onPick(mine ? { ...mine } : { date: s.date, venue: s.venue, city: s.city, raw: "", slug: s.slug })}>
                    <span className="d mono">{s.date.slice(5).replace("-", "/")}</span>
                    <span className="v"><b>{s.venue}</b>{s.city && <span>{s.city}</span>}</span>
                    {mine ? <span className="tag pieced">you were there</span> : <span className="go" aria-hidden="true">&gt;</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="formactions" style={{ marginTop: 14 }}>
        <button type="button" onClick={() => onPick({ date: "", venue: "", city: "", raw: "", slug: null })}>Not listed? Enter it yourself</button>
      </div>
    </section>
  );
}

/* ---------------- Add / edit form ---------------- */

function ShowForm({ draft, onSave, onBack, onCancel }: {
  draft: Draft; onSave: (d: Draft) => Promise<void>; onBack: () => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(draft);
  const [bip, setBip] = useState<"idle" | "loading" | "ok" | "empty" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const pull = useCallback(async () => {
    if (!draft.slug) return;
    setBip("loading");
    try {
      const res = await fetch(`/api/bip/setlist/${encodeURIComponent(draft.slug)}`);
      const body = await res.json();
      if (!res.ok) throw new Error();
      if (body.raw) {
        setD((cur) => (cur.raw ? cur : { ...cur, raw: body.raw }));
        setBip("ok");
      } else setBip("empty");
    } catch {
      setBip("error");
    }
  }, [draft.slug]);
  useEffect(() => { if (!draft.id && draft.slug && !draft.raw) pull(); }, [pull, draft.id, draft.slug, draft.raw]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.date) return setMsg("Pick the date of the show.");
    if (!parseSetlist(d.raw).length) return setMsg("Add at least one song to the setlist.");
    setSaving(true);
    setMsg("Saving…");
    try {
      await onSave({ ...d, raw: d.raw.trim(), venue: d.venue.trim(), city: d.city.trim() });
    } catch (err: any) {
      setMsg(err.message);
      setSaving(false);
    }
  }

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });

  return (
    <section className="panel">
      <form onSubmit={submit}>
        <div className="formhead">
          <h2>{d.id ? "Edit show" : d.date ? fmtDate(d.date) + (d.venue ? " · " + d.venue : "") : "Enter a show"}</h2>
          {!d.id && <button type="button" className="ghost" onClick={onBack}>&lt; Pick a different show</button>}
        </div>
        {bip === "loading" && <p className="note">Pulling the setlist from BIP…</p>}
        {bip === "ok" && <p className="note">Setlist pulled from BIP. Check it over, then add the show.</p>}
        {bip === "empty" && <p className="note">BIP doesn&rsquo;t have a setlist for this show yet. You can type it in below.</p>}
        {bip === "error" && (
          <div className="banner"><span>BIP isn&rsquo;t answering right now.</span><button type="button" onClick={pull}>Try again</button></div>
        )}
        <div className="row">
          <label htmlFor="f-date">Date<input id="f-date" type="date" required value={d.date} onChange={set("date")} /></label>
          <label htmlFor="f-venue">Venue<input id="f-venue" placeholder="The Fillmore" value={d.venue} onChange={set("venue")} /></label>
          <label htmlFor="f-city">City<input id="f-city" placeholder="Philadelphia, PA" value={d.city} onChange={set("city")} /></label>
        </div>
        <label htmlFor="f-raw">
          Setlist
          <textarea id="f-raw" value={d.raw} onChange={set("raw")}
            placeholder={"Set 1: Basis for a Day (inverted) > Mindless Dribble, Helicopters\nSet 2: Shem-Rah Boo > Basis for a Day (ending)\nEncore: Home Again"} />
        </label>
        <p className="hint">
          One set per line. Use <code>&gt;</code> for a segue and a comma for a stop. Tag halves with <code>(inverted)</code>,{" "}
          <code>(dyslexic)</code>, <code>(beginning)</code>, <code>(ending)</code> or <code>(unfinished)</code>.
        </p>
        <div className="panel" style={{ background: "var(--bg)" }}>
          <h3>Preview</h3>
          <div className="setlist" style={{ margin: 0 }}><SetlistView raw={d.raw} /></div>
        </div>
        <div className="formactions">
          <button className="primary" type="submit" disabled={saving}>{d.id ? "Save changes" : "Add show"}</button>
          {d.id && <button type="button" onClick={onCancel}>Cancel</button>}
        </div>
        {msg && <p className="note" role="status">{msg}</p>}
      </form>
    </section>
  );
}
