import type { TeamProfile } from "../teams";
import { NAVI } from "../teams";
import type { RawMatch, RawPerson } from "./raw";

const API = "https://liquipedia.net/counterstrike/api.php";

export const LIQUIPEDIA_UA =
  "NAVI-CS2-Dashboard/1.0 (personal non-commercial CS2 fan dashboard; +https://navi.gg)";

let nextSlot = 0;

async function pace(): Promise<void> {
  const now = Date.now();
  if (now < nextSlot) {
    await new Promise((resolve) => setTimeout(resolve, nextSlot - now));
  }
  nextSlot = Date.now() + 2000;
}

type WikiPage = {
  title?: string;
  revisions?: Array<{ slots?: { main?: { content?: string } } }>;
  extlinks?: Array<{ url?: string }>;
};

type MwResponse = {
  type?: string;
  return?: string;
  message?: string;
  error?: { info?: string };
  query?: { pages?: WikiPage[] };
};

async function mediawiki(body: Record<string, string>): Promise<MwResponse> {
  await pace();
  const response = await fetch(API, {
    method: "POST",
    cache: "no-store",
    headers: {
      "User-Agent": LIQUIPEDIA_UA,
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  if (!response.ok) {
    throw new Error(`Liquipedia відповіла ${response.status}`);
  }
  return (await response.json()) as MwResponse;
}

async function runLua(question: string): Promise<unknown> {
  const data = await mediawiki({
    action: "scribunto-console",
    format: "json",
    title: "Module:MatchTable/Custom",
    token: "+\\",
    content: "return {}\n",
    question,
  });
  if (data.error?.info) throw new Error(data.error.info);
  if (data.type === "error") throw new Error(data.message || "Помилка Liquipedia");
  const returned = data.return ?? "";
  if (!returned || returned.startsWith("ERR") || returned.startsWith("Error")) {
    throw new Error(returned || "Порожня відповідь Liquipedia");
  }
  return JSON.parse(returned) as unknown;
}

function seasonLua(team: TeamProfile): string {
  return `= (function()
  local lpdb = mw.ext.LiquipediaDB.lpdb
  local ok, res = pcall(function()
    local matches = lpdb("match2", {
      conditions = [=[ [[date::>2025-12-31]] AND [[opponent::${team.page}]] ]=],
      query = "match2id, pagename, date, winner, tournament, section, bestof, finished, type, liquipediatier, liquipediatiertype, vod, match2opponents, match2games",
      limit = 500,
      order = "date asc",
    })
    local wanted = {}
    for _, m in ipairs(matches) do
      if tostring(m.finished) ~= "1" then
        for _, o in ipairs(m.match2opponents or {}) do
          local name = o.name or ""
          local template = (o.template or ""):lower()
          local lower = name:lower()
          if name ~= "" and lower ~= "${team.name}" and not template:find("^${team.templatePrefix}") then
            wanted[name] = true
          end
        end
      end
    end
    local forms = {}
    for name, _ in pairs(wanted) do
      if not name:find("[%[%]]") and not name:find('"') then
        forms[name] = lpdb("match2", {
          conditions = "[[opponent::" .. name .. "]] AND [[finished::1]]",
          query = "match2id, date, winner, finished, bestof, tournament, match2opponents, match2games",
          limit = 10,
          order = "date desc",
        })
      end
    end
    local wiki = ""
    local okWiki, content = pcall(function()
      local title = mw.title.new("${team.page}")
      if not title then return "" end
      return title:getContent() or ""
    end)
    if okWiki and type(content) == "string" then wiki = content end
    return { matches = matches, forms = forms, wiki = wiki }
  end)
  if not ok then return "ERR " .. tostring(res) end
  return mw.text.jsonEncode(res)
end)()`;
}

export type SeasonBundle = {
  matches: RawMatch[];
  forms: Record<string, RawMatch[]>;
  wiki: string;
};

export async function fetchSeasonBundle(team: TeamProfile = NAVI): Promise<SeasonBundle> {
  const parsed = (await runLua(seasonLua(team))) as SeasonBundle;
  if (!Array.isArray(parsed.matches)) {
    throw new Error("Liquipedia не повернула серії");
  }
  return {
    matches: parsed.matches,
    forms: parsed.forms ?? {},
    wiki: parsed.wiki ?? "",
  };
}

export async function fetchTeamWiki(team: TeamProfile = NAVI): Promise<string> {
  const data = await mediawiki({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    titles: team.page,
  });
  const page = (data.query?.pages ?? [])[0];
  return page?.revisions?.[0]?.slots?.main?.content ?? "";
}

export async function fetchPlayers(ids: string[]): Promise<RawPerson[]> {
  if (!ids.length) return [];
  const conditions = ids
    .map((id) => id.replace(/[\[\]"]/g, ""))
    .filter(Boolean)
    .map((id) => `[[id::${id}]]`)
    .join(" OR ");
  const question = `= (function()
  local ok, res = pcall(function()
    return mw.ext.LiquipediaDB.lpdb("player", {
      conditions = [=[ ${conditions} ]=],
      query = "pagename, id, name, nationality, extradata",
      limit = 50,
    })
  end)
  if not ok then return "ERR " .. tostring(res) end
  return mw.text.jsonEncode(res)
end)()`;
  const parsed = await runLua(question);
  return Array.isArray(parsed) ? (parsed as RawPerson[]) : [];
}

export async function fetchTelegramLinks(titles: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!titles.length) return map;
  const data = await mediawiki({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "extlinks",
    ellimit: "500",
    titles: titles.join("|"),
  });
  for (const page of data.query?.pages ?? []) {
    const title = page.title || "";
    const links: string[] = [];
    for (const link of page.extlinks ?? []) {
      const url = link.url || "";
      const slug = telegramSlug(url);
      if (slug) links.push(slug);
    }
    map.set(title, links);
  }
  return map;
}

export function telegramSlug(url: string): string | null {
  const match = url.match(/https?:\/\/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,64})\/?$/i);
  if (!match) return null;
  const slug = match[1];
  if (["joinchat", "share", "addstickers", "iv", "s"].includes(slug.toLowerCase())) return null;
  return slug;
}
