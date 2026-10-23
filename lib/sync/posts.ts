import { classifyTone, type Tone } from "../tone";
import { LIQUIPEDIA_UA } from "./liquipedia";

export type PostDraft = {
  id: string;
  source: "navi.gg" | "telegram";
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
  const response = await fetch(url, {
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
      url: item.uri,
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
  const response = await fetch(`https://t.me/s/${channel}`, {
    cache: "no-store",
    headers: { "User-Agent": LIQUIPEDIA_UA, Accept: "text/html" },
  });
  if (!response.ok) throw new Error(`Telegram ${channel} відповів ${response.status}`);
  return parseTelegram(await response.text(), channel);
}
