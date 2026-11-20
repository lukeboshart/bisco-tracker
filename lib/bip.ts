import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServiceClient } from "@/lib/supabase/server";
import { bipToRaw, type DirectoryShow } from "@/lib/setlist";

const BIP_URL = process.env.BIP_MCP_URL || "https://discobiscuits.net/mcp";
const HOUR = 3600_000;
const DAY = 24 * HOUR;

export class BipError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

// One call to a tool on the Bisco Internet Project MCP server.
async function callBip(tool: string, args: Record<string, unknown>): Promise<any> {
  const client = new Client({ name: "bisco-tracker", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(BIP_URL));
  try {
    await client.connect(transport);
    const res: any = await client.callTool({ name: tool, arguments: args });
    const text = Array.isArray(res?.content) ? res.content.find((c: any) => c.type === "text")?.text : undefined;
    if (res?.isError) throw new BipError(text || "BIP reported an error");
    let payload = res?.structuredContent;
    if (payload === undefined && text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new BipError("BIP returned something unexpected");
      }
    }
    if (payload && typeof payload === "object" && "error" in payload) {
      throw new BipError(String((payload as any).error), 404);
    }
    return payload;
  } catch (e) {
    if (e instanceof BipError) throw e;
    throw new BipError("BIP isn't answering right now");
  } finally {
    await client.close().catch(() => {});
  }
}

function yearMaxAge(year: number) {
  const now = new Date().getFullYear();
  return year >= now - 1 ? 6 * HOUR : 30 * DAY;
}

export async function getYear(year: number): Promise<DirectoryShow[]> {
  const db = createServiceClient();
  const { data: cached } = await db.from("bip_years").select("shows, fetched_at").eq("year", year).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < yearMaxAge(year)) {
    return cached.shows as DirectoryShow[];
  }
  try {
    const payload = await callBip("get_shows_by_year", { year, limit: 500 });
    const list: any[] = Array.isArray(payload?.shows) ? payload.shows : [];
    const shows: DirectoryShow[] = list
      .filter((s) => s && s.date)
      .map((s) => ({
        date: String(s.date).slice(0, 10),
        venue: s.venueName || "Unknown venue",
        city: [s.venueCity, s.venueState].filter(Boolean).join(", "),
        slug: s.slug || null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    await db.from("bip_years").upsert({ year, shows, fetched_at: new Date().toISOString() });
    return shows;
  } catch (e) {
    if (cached) return cached.shows as DirectoryShow[]; // stale beats nothing
    throw e;
  }
}

export async function getSetlist(slug: string): Promise<{ raw: string }> {
  const db = createServiceClient();
  const { data: cached } = await db.from("bip_setlists").select("setlist, fetched_at").eq("slug", slug).maybeSingle();
  const showDate = new Date(slug.slice(0, 10));
  const recent = Date.now() - showDate.getTime() < 14 * DAY;
  if (cached && (!recent || Date.now() - new Date(cached.fetched_at).getTime() < 6 * HOUR)) {
    return { raw: bipToRaw(cached.setlist) };
  }
  try {
    const payload = await callBip("get_setlist", { slug });
    await db.from("bip_setlists").upsert({ slug, setlist: payload, fetched_at: new Date().toISOString() });
    return { raw: bipToRaw(payload) };
  } catch (e) {
    if (cached) return { raw: bipToRaw(cached.setlist) };
    throw e;
  }
}

/* ---------- Bust-outs and rarity ---------- */

export type BandShow = { date: string; slug: string | null };
export type SongInfo = {
  slug: string; title: string; timesPlayed: number;
  performances: { d: string; s: string | null }[]; // every performance, oldest first, one per show
};

const FIRST_YEAR = 1995;

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await fn(items[n]);
    }
  }));
  return out;
}

// Every show the band has played, oldest first.
export async function getAllShows(): Promise<BandShow[]> {
  const years: number[] = [];
  for (let y = FIRST_YEAR; y <= new Date().getFullYear(); y++) years.push(y);
  const lists = await pool(years, 4, async (y) => {
    try { return await getYear(y); } catch { return [] as DirectoryShow[]; }
  });
  return lists.flat().map((s) => ({ date: s.date, slug: s.slug })).sort((a, b) => a.date.localeCompare(b.date));
}

const songKeyOf = (n: string) =>
  n.toLowerCase().replace(/&/g, " and ").replace(/[‘’']/g, "").replace(/[^a-z0-9]+/g, "");

async function fetchSong(name: string): Promise<SongInfo | null> {
  const want = songKeyOf(name);
  const queries = [...new Set([
    name,
    name.replace(/&/g, "and"),
    name.replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2).slice(0, 2).join(" "),
  ].map((q) => q.trim()).filter(Boolean))];
  let hit: any = null;
  for (const query of queries) {
    const found = await callBip("search_songs", { query, limit: 20 });
    const results: any[] = Array.isArray(found?.results) ? found.results : [];
    hit = results.find((r) => songKeyOf(r.title || "") === want);
    if (hit) break;
  }
  if (!hit) return null;
  const [stats, perf] = await Promise.all([
    callBip("get_song_statistics", { songSlug: hit.slug }).catch(() => null),
    callBip("get_song_performances", { songSlug: hit.slug, limit: 500 }),
  ]);
  const seen = new Set<string>();
  const performances = (Array.isArray(perf?.performances) ? perf.performances : [])
    .map((p: any) => ({ d: String(p.showDate || "").slice(0, 10), s: p.showSlug || null }))
    .filter((p: any) => p.d && !seen.has(p.s || p.d) && seen.add(p.s || p.d))
    .sort((a: any, b: any) => a.d.localeCompare(b.d));
  const timesPlayed = Number(stats?.statistics?.timesPlayed) || performances.length;
  return { slug: hit.slug, title: hit.title, timesPlayed, performances };
}

// Song details for a batch of names, from the cache when fresh.
export async function getSongs(names: string[]): Promise<Record<string, SongInfo | null>> {
  const db = createServiceClient();
  const keys = [...new Set(names.map(songKeyOf).filter(Boolean))];
  const { data: rows } = await db.from("bip_songs").select("*").in("key", keys);
  const cached = new Map((rows || []).map((r: any) => [r.key, r]));
  const out: Record<string, SongInfo | null> = {};
  await pool(names, 4, async (name) => {
    const key = songKeyOf(name);
    const row: any = cached.get(key);
    const age = row ? Date.now() - new Date(row.fetched_at).getTime() : Infinity;
    if (row && age < DAY) {
      out[name] = row.slug ? { slug: row.slug, title: row.title, timesPlayed: row.times_played, performances: row.performances } : null;
      return;
    }
    try {
      const info = await fetchSong(name);
      await db.from("bip_songs").upsert({
        key, slug: info?.slug ?? null, title: info?.title ?? null, times_played: info?.timesPlayed ?? null,
        performances: info?.performances ?? [], fetched_at: new Date().toISOString(),
      });
      out[name] = info;
    } catch {
      out[name] = row?.slug ? { slug: row.slug, title: row.title, timesPlayed: row.times_played, performances: row.performances } : null;
    }
  });
  return out;
}
