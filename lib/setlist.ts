// Setlist parsing and stats. Shared by the browser and the server.

export type DirectoryShow = { date: string; venue: string; city: string; slug: string | null };
export type Show = { id: string; date: string; venue: string; city: string; raw: string; slug: string | null };
export type Song = { name: string; partial: string | null; segue: boolean };
export type SetBlock = { label: string; songs: Song[] };

// Starter list for the chase list. Replace with BIP's full catalog later.
export const CATALOG = ["Above the Waves","Aceetobee","Air Song","Astronaut","Basis for a Day","Bernstein & Chasnoff","Caterpillar","Confrontation","Crickets","Digital Buddha","Floodlights","Helicopters","Highwire","Home Again","Hope","I-Man","Jigsaw Earth","Kitchen Mitts","Konkrete","Little Shiva","M.E.M.P.","Magellan","Mindless Dribble","Morph Dusseldorf","Mulberry's Dream","Munchkin Invasion","Orch Theme","Pat & Dex","Rock Candy","Run Like Hell","Save the Robots","Shem-Rah Boo","Spacebirdmatingcall","Spraypaint","Story of the World","Svenghali","The Overture","Tricycle","Triumph","Voices Insane"];
// Matching key that ignores spelling differences like "&" vs "and", punctuation and spacing,
// so "Pat & Dex" and "Pat and Dex" count as the same song.
export const songKey = (n: string) =>
  n.toLowerCase().replace(/&/g, " and ").replace(/[‘’']/g, "").replace(/[^a-z0-9]+/g, "");
const CANON = new Map(CATALOG.map((s) => [songKey(s), s]));
const canon = (n: string) => CANON.get(songKey(n)) || n.replace(/\s+/g, " ").trim();
const PARTIAL = /\((inverted|dyslexic|ending|end|beginning|begin|unfinished|partial|middle|reprise)\)/i;

export function parseSetlist(raw: string): SetBlock[] {
  const sets: SetBlock[] = [];
  for (let line of String(raw || "").split(/\n+/)) {
    line = line.trim();
    if (!line) continue;
    let label = "";
    const m = line.match(/^(set\s*[0-9ivx]+|encore\s*\d*|e\d*)\s*[:.\-–]\s*/i);
    if (m) {
      label = m[1].replace(/^e(\d*)$/i, "Encore $1").replace(/^(\w)/, (c) => c.toUpperCase()).trim();
      line = line.slice(m[0].length);
    }
    const parts = line.split(/\s*(->|→|>|,)\s*/);
    const songs: Song[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      let tok = (parts[i] || "").trim();
      if (!tok) continue;
      const sep = parts[i + 1] || "";
      const pm = tok.match(PARTIAL);
      tok = tok.replace(new RegExp(PARTIAL.source, "gi"), "").replace(/[*#^+]+$/, "").trim();
      if (!tok) continue;
      songs.push({ name: canon(tok), partial: pm ? pm[1].toLowerCase() : null, segue: !!sep && sep !== "," });
    }
    if (songs.length) sets.push({ label: label || "Set " + (sets.length + 1), songs });
  }
  return sets;
}

export const songCount = (raw: string) => parseSetlist(raw).reduce((a, s) => a + s.songs.length, 0);

function showSongs(sets: SetBlock[]) {
  const m = new Map<string, { name: string; full: number; part: number; status?: string }>();
  for (const set of sets)
    for (const s of set.songs) {
      const k = songKey(s.name);
      const e = m.get(k) || { name: s.name, full: 0, part: 0 };
      s.partial ? e.part++ : e.full++;
      m.set(k, e);
    }
  for (const e of m.values()) e.status = e.full ? "full" : e.part >= 2 ? "pieced" : "partial";
  return m;
}

export type SongStat = {
  name: string; shows: number; whole: number; partOnly: number;
  dates: { date: string; status: string }[]; gap: number; last: string;
};

export function computeStats(shows: Show[]) {
  const sorted = [...shows].sort((a, b) => a.date.localeCompare(b.date));
  const songs = new Map<string, any>(), segues = new Map<string, number>(), years = new Map<string, number>(), venues = new Set<string>();
  let performances = 0;
  sorted.forEach((sh, idx) => {
    venues.add((sh.venue || "") + "|" + (sh.city || ""));
    const y = sh.date.slice(0, 4);
    years.set(y, (years.get(y) || 0) + 1);
    const sets = parseSetlist(sh.raw);
    for (const set of sets) {
      performances += set.songs.length;
      set.songs.forEach((s, i) => {
        const nx = set.songs[i + 1];
        if (s.segue && nx) {
          const k = s.name + "|" + nx.name;
          segues.set(k, (segues.get(k) || 0) + 1);
        }
      });
    }
    for (const [k, e] of showSongs(sets)) {
      const st = songs.get(k) || { name: e.name, shows: 0, whole: 0, partOnly: 0, dates: [], lastIdx: -1 };
      st.shows++;
      e.status === "partial" ? st.partOnly++ : st.whole++;
      st.dates.push({ date: sh.date, status: e.status });
      st.lastIdx = idx;
      songs.set(k, st);
    }
  });
  const list: SongStat[] = [...songs.values()].map((s) => ({
    ...s, gap: sorted.length - 1 - s.lastIdx, last: s.dates[s.dates.length - 1].date,
  }));
  list.sort((a, b) => b.shows - a.shows || b.whole - a.whole || a.name.localeCompare(b.name));
  return {
    count: sorted.length, performances, venues: venues.size, list,
    segues: [...segues].sort((a, b) => b[1] - a[1]),
    years: [...years].sort((a, b) => a[0].localeCompare(b[0])),
    heard: new Set(songs.keys()),
  };
}

// Convert a BIP get_setlist payload into the tracker's plain-text setlist format.
function setLabel(n: string, i: number) {
  const m = String(n || "").match(/^([SE])(\d*)$/i);
  if (m) return m[1].toUpperCase() === "E" ? (m[2] && m[2] !== "1" ? "Encore " + m[2] : "Encore") : "Set " + (m[2] || 1);
  return /^(set\s*[0-9ivx]+|encore\s*\d*)$/i.test(String(n || "").trim()) ? String(n).trim() : "Set " + (i + 1);
}
function partialTag(n: unknown) {
  const m = String(n || "").match(/inverted|dyslexic|unfinished|ending|beginning|partial/i);
  return m ? m[0].toLowerCase() : "";
}
export function bipToRaw(p: any): string {
  const sets: any[] = p && Array.isArray(p.sets) ? p.sets : [];
  return sets
    .map((set, si) => {
      const tr = [...(set.tracks || [])].filter((t) => t && t.song).sort((a, b) => (a.position || 0) - (b.position || 0));
      if (!tr.length) return "";
      return setLabel(set.name, si) + ": " + tr.map((t, i) => {
        const tag = partialTag(t.notes);
        const sg = String(t.segue || "").trim();
        return t.song + (tag ? " (" + tag + ")" : "") + (i < tr.length - 1 ? (sg && sg !== "," ? " > " : ", ") : "");
      }).join("");
    })
    .filter(Boolean)
    .join("\n");
}

export const fmtDate = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
export const stubDate = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  const dt = new Date(y, m - 1, dd);
  return { day: dd, mon: dt.toLocaleDateString(undefined, { month: "short" }), yr: y };
};

/* ---------- Bust-outs and rarity ---------- */

export type BandShow = { date: string; slug: string | null };
export type SongInfo = { slug: string; title: string; timesPlayed: number; firstPlayed?: string | null; performances: { d: string; s: string | null }[] };
export type Rarity = { name: string; timesPlayed: number; heard: number; debut: string; since: number; rate: number | null };
export type Bustout = { name: string; date: string; venue: string; gap: number; prevDate: string };

export function computeRarities(shows: Show[], band: BandShow[], info: Record<string, SongInfo | null>) {
  const bySlug = new Map<string, number>(), byDate = new Map<string, number>();
  band.forEach((b, i) => {
    if (b.slug) bySlug.set(b.slug, i);
    if (!byDate.has(b.date)) byDate.set(b.date, i);
  });
  const indexOf = (slug: string | null, date: string) =>
    (slug && bySlug.has(slug) ? bySlug.get(slug)! : byDate.has(date) ? byDate.get(date)! : -1);

  const bustouts: Bustout[] = [];
  const debuts: { name: string; date: string; venue: string }[] = [];
  const heardTimes = new Map<string, Rarity>();
  // Number of band shows on or after a date (band is sorted oldest first).
  const showsSince = (date: string) => {
    let lo = 0, hi = band.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (band[mid].date < date) lo = mid + 1; else hi = mid; }
    return band.length - lo;
  };

  for (const sh of [...shows].sort((a, b) => a.date.localeCompare(b.date))) {
    const names = new Set(parseSetlist(sh.raw).flatMap((set) => set.songs.map((s) => s.name)));
    for (const name of names) {
      const inf = info[name];
      if (!inf) continue;
      const k = songKey(name);
      let h = heardTimes.get(k);
      if (!h) {
        const debut = inf.firstPlayed || (inf.performances.length >= inf.timesPlayed ? inf.performances[0]?.d : "") || "";
        const since = debut ? showsSince(debut) : 0;
        h = { name, timesPlayed: inf.timesPlayed, heard: 0, debut, since, rate: since ? Math.min(1, inf.timesPlayed / since) : null };
      }
      h.heard++;
      heardTimes.set(k, h);
      const perfs = inf.performances;
      const i = perfs.findIndex((p) => (sh.slug && p.s === sh.slug) || p.d === sh.date);
      if (i < 0) continue;
      const complete = perfs.length >= inf.timesPlayed;
      if (i === 0) {
        if (complete) debuts.push({ name, date: sh.date, venue: sh.venue });
        continue;
      }
      const prev = perfs[i - 1];
      const a = indexOf(prev.s, prev.d), b = indexOf(sh.slug, sh.date);
      if (a >= 0 && b > a) bustouts.push({ name, date: sh.date, venue: sh.venue, gap: b - a - 1, prevDate: prev.d });
    }
  }
  bustouts.sort((x, y) => y.gap - x.gap || y.date.localeCompare(x.date));
  // Rarest = lowest share of shows played since the song's debut; songs without a known debut go last.
  const rarest = [...heardTimes.values()].sort((x, y) =>
    (x.rate ?? 2) - (y.rate ?? 2) || x.timesPlayed - y.timesPlayed || x.name.localeCompare(y.name));
  return { bustouts, debuts, rarest };
}
