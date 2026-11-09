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
