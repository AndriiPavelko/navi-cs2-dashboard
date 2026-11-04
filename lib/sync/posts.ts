import { classifyTone, type Tone } from "../tone";
import { LIQUIPEDIA_UA } from "./liquipedia";
import { sourceFetch } from "./http";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type PostDraft = {
  id: string;
  source: "navi.gg" | "telegram" | "fazeclan.com";
  author: string;
  title: string;
  body: string;
  url: string;
  publishedAt: string | null;
  tone: Tone;
};

type NewsItem = {
  id?: number;
  uri?: string;
  title?: string;
  summary?: string;
  post_at_iso?: string;
  game?: { abbreviation?: string; uri?: string };
};

function decode(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function fetchNaviNews(): Promise<PostDraft[]> {
  const url = "https://navi.gg/api/client/publications/news?lang=ua&page=1&perPage=12&game=cs2";
  const response = await sourceFetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": LIQUIPEDIA_UA,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`navi.gg відповів ${response.status}`);
  const payload = (await response.json()) as { data?: NewsItem[] };
  const posts: PostDraft[] = [];
  for (const item of payload.data ?? []) {
    const game = item.game?.abbreviation || item.game?.uri || "";
    if (game !== "CS2" && game !== "cs2") continue;
    if (!item.uri || !item.title) continue;
    const summary = (item.summary || "").trim();
    posts.push({
      id: `news:${item.id ?? item.uri}`,
      source: "navi.gg",
      author: "NAVI",
      title: item.title.trim(),
      body: summary,
      url: new URL(item.uri, "https://navi.gg").href,
      publishedAt: item.post_at_iso || null,
      tone: classifyTone(`${item.title}\n${summary}`),
    });
  }
  return posts;
}

export function parseTelegram(html: string, channel: string): PostDraft[] {
  const posts: PostDraft[] = [];
  for (const block of html.split("tgme_widget_message_wrap").slice(1)) {
    const key = block.match(/data-post="([^"]+)"/)?.[1];
    if (!key || !key.startsWith(`${channel}/`)) continue;
    const publishedAt = block.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? null;
    const authorRaw = block.match(/tgme_widget_message_owner_name[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? channel;
    const textRaw = block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const text = decode(textRaw);
    const owner = decode(authorRaw) || channel;
    const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
    posts.push({
      id: `tg:${key}`,
      source: "telegram",
      author: owner,
      title: (firstLine || "Допис без тексту").slice(0, 160),
      body: text.slice(0, 700),
      url: `https://t.me/${key}`,
      publishedAt,
      tone: classifyTone(text),
    });
  }
  return posts.slice(-15);
}

export async function fetchTelegramChannel(channel: string): Promise<PostDraft[]> {
  const response = await sourceFetch(`https://t.me/s/${channel}`, {
    cache: "no-store",
    headers: { "User-Agent": LIQUIPEDIA_UA, Accept: "text/html" },
  });
  if (!response.ok) throw new Error(`Telegram ${channel} відповів ${response.status}`);
  return parseTelegram(await response.text(), channel);
}

export function relevantPost(post: Pick<PostDraft, "title" | "body">, nicknames: string[] = []): boolean {
  const text = `${post.title} ${post.body}`.toLowerCase();
  if (/\bcs2\b|\bcs:go\b|counter[ -]strike|\biem\b|\besl\b|\bblast\b|\bpgl\b/.test(text)) return true;
  return nicknames.some((nick) => nick.length >= 3 && new RegExp(`(?:^|[^a-z0-9])${nick.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "i").test(text));
}

export function parseFazeNews(xml: string): PostDraft[] {
  if (XMLValidator.validate(xml) !== true) throw new Error("FaZe: некоректна Atom-стрічка");
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: true }).parse(xml);
  if (!parsed.feed) throw new Error("FaZe не повернула Atom-стрічку");
  const entries = parsed.feed.entry ? (Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry]) : [];
  return entries.flatMap((entry: Record<string, unknown>) => {
    const links = Array.isArray(entry.link) ? entry.link : [entry.link];
    const link = links.find((item) => item?.["@_rel"] === "alternate") ?? links[0];
    const url = String(link?.["@_href"] ?? "");
    if (!url.startsWith("https://fazeclan.com/")) return [];
    const content = entry.content ?? entry.summary ?? "";
    const title = decode(String(entry.title ?? ""));
    const body = decode(typeof content === "object" && content ? String((content as Record<string, unknown>)["#text"] ?? "") : String(content));
    const published = String(entry.published ?? entry.updated ?? "");
    return [{ id: `faze-news:${String(entry.id ?? url)}`, source: "fazeclan.com" as const, author: "FaZe Clan", title, body: body.slice(0, 1500), url,
      publishedAt: Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null, tone: classifyTone(`${title}\n${body}`) }];
  });
}

export async function fetchFazeNews(): Promise<PostDraft[]> {
  const response = await sourceFetch("https://fazeclan.com/blogs/news.atom", {
    cache: "no-store", headers: { "User-Agent": LIQUIPEDIA_UA, Accept: "application/atom+xml" },
  });
  return parseFazeNews(await response.text()).filter((post) => relevantPost(post));
}

export function deduplicatePosts<T extends Pick<PostDraft, "url" | "title" | "body">>(posts: T[]): T[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    const normalized = `${post.title} ${post.body}`.toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 200);
    const contentKey = normalized.length >= 40 ? `text:${normalized}` : `url:${post.url}`;
    if (seen.has(post.url) || seen.has(contentKey)) return false;
    seen.add(post.url); seen.add(contentKey);
    return true;
  });
}
