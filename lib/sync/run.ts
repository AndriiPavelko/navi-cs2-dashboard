import type { PoolClient } from "pg";
import { ensureSchema, getPool } from "../db";
import { computeWinBand, type RecordLine } from "../winband";
import {
  fetchPlayers,
  fetchSeasonBundle,
  fetchTeamWiki,
  fetchTelegramLinks,
  telegramSlug,
} from "./liquipedia";
import { mapsFromRaw, mapsFromSeries, normalizeMatch, recordFromRaw, type StoredSeries } from "./normalize";
import { fetchNaviNews, fetchTelegramChannel, type PostDraft } from "./posts";
import { asArray, type RawMatch } from "./raw";
import {
  FLAG_COUNTRY,
  lpdbRoleOf,
  normalizeRole,
  parseActiveRoster,
  telegramSlugsFromWiki,
  type SquadPerson,
} from "./roster";
import type { RawPerson } from "./raw";

export type SyncSummary = {
  matches: number;
  upcoming: number;
  roster: number;
  maps: number;
  posts: number;
  opponents: string[];
};

const YEAR_START = new Date("2026-01-01T00:00:00Z");

function lineOf(series: StoredSeries[]): RecordLine {
  const line: RecordLine = { wins: 0, losses: 0, draws: 0 };
  for (const item of series) {
    if (item.naviWon === true) line.wins += 1;
    else if (item.naviWon === false) line.losses += 1;
    else line.draws += 1;
  }
  return line;
}

function sameOpponent(series: StoredSeries, name: string, template: string | null): boolean {
  if (series.opponentName.toLowerCase() === name.toLowerCase()) return true;
  if (template && series.opponentTemplate && series.opponentTemplate.toLowerCase() === template.toLowerCase()) {
    return true;
  }
  return false;
}

function formRows(forms: Record<string, RawMatch[]>, name: string): RawMatch[] {
  if (forms[name]) return asArray<RawMatch>(forms[name]);
  const key = Object.keys(forms).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? asArray<RawMatch>(forms[key]) : [];
}

function withBands(series: StoredSeries[], forms: Record<string, RawMatch[]>): Map<string, { low: number; high: number; reasons: string[] }> {
  const bands = new Map<string, { low: number; high: number; reasons: string[] }>();
  for (const item of series) {
    if (item.finished) continue;
    const prior = series
      .filter((other) => other.finished && other.at < item.at)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 10);
    const history = formRows(forms, item.opponentName);
    const side = { name: item.opponentName, template: item.opponentTemplate ?? "" };
    const h2hSeries = series.filter(
      (other) =>
        other.finished &&
        other.at < item.at &&
        other.at >= YEAR_START &&
        sameOpponent(other, item.opponentName, item.opponentTemplate),
    );
    const seasonMaps = mapsFromSeries(
      series.filter((other) => other.finished && other.at >= YEAR_START && other.at < item.at),
    );
    bands.set(
      item.id,
      computeWinBand({
        opponent: item.opponentName,
        navi: lineOf(prior),
        opponentForm: recordFromRaw(history, side),
        h2h: lineOf(h2hSeries),
        naviMaps: seasonMaps,
        oppMaps: mapsFromRaw(history, side),
      }),
    );
  }
  return bands;
}

type PlayerRow = {
  id: string;
  nickname: string;
  realName: string | null;
  country: string | null;
  role: string;
  isCoach: boolean;
  joinDate: string | null;
  sortOrder: number;
  url: string;
};

function mergeRoster(squad: SquadPerson[], people: RawPerson[]): PlayerRow[] {
  return squad.map((person, index) => {
    const lp = people.find((item) => (item.id || "").toLowerCase() === person.id.toLowerCase());
    const role = normalizeRole(person.role, person.igl, lpdbRoleOf(lp?.extradata));
    const page = lp?.pagename || person.id;
    return {
      id: page,
      nickname: lp?.id || person.id,
      realName: lp?.name || person.name || null,
      country: FLAG_COUNTRY[person.flag] || lp?.nationality || null,
      role,
      isCoach: role === "coach",
      joinDate: person.joinDate,
      sortOrder: index,
      url: `https://liquipedia.net/counterstrike/${encodeURIComponent(page.replace(/ /g, "_"))}`,
    };
  });
}

async function writeAll(
  client: PoolClient,
  series: StoredSeries[],
  bands: Map<string, { low: number; high: number; reasons: string[] }>,
  roster: PlayerRow[],
  posts: PostDraft[],
): Promise<void> {
  await client.query("BEGIN");
  try {
    for (const item of series) {
      const band = bands.get(item.id);
      await client.query(
        `INSERT INTO series (
           id, played_at, tournament, section, tier, event_type, best_of, page_name,
           opponent_name, opponent_template, navi_score, opponent_score, navi_won, finished,
           navi_players, opponent_players, win_low, win_high, win_reasons, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,
           $9,$10,$11,$12,$13,$14,
           $15::jsonb,$16::jsonb,$17,$18,$19::jsonb,NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           played_at = EXCLUDED.played_at,
           tournament = EXCLUDED.tournament,
           section = EXCLUDED.section,
           tier = EXCLUDED.tier,
           event_type = EXCLUDED.event_type,
           best_of = EXCLUDED.best_of,
           page_name = EXCLUDED.page_name,
           opponent_name = EXCLUDED.opponent_name,
           opponent_template = EXCLUDED.opponent_template,
           navi_score = EXCLUDED.navi_score,
           opponent_score = EXCLUDED.opponent_score,
           navi_won = EXCLUDED.navi_won,
           finished = EXCLUDED.finished,
           navi_players = EXCLUDED.navi_players,
           opponent_players = EXCLUDED.opponent_players,
           win_low = EXCLUDED.win_low,
           win_high = EXCLUDED.win_high,
           win_reasons = EXCLUDED.win_reasons,
           updated_at = NOW()`,
        [
          item.id,
          item.at.toISOString(),
          item.tournament,
          item.section,
          item.tier,
          item.eventType,
          item.bestOf,
          item.pageName,
          item.opponentName,
          item.opponentTemplate,
          item.naviScore,
          item.opponentScore,
          item.naviWon,
          item.finished,
          JSON.stringify(item.naviPlayers),
          JSON.stringify(item.opponentPlayers),
          band?.low ?? null,
          band?.high ?? null,
          band ? JSON.stringify(band.reasons) : null,
        ],
      );
    }

    const ids = series.map((item) => item.id);
    await client.query("DELETE FROM maps WHERE series_id = ANY($1::text[])", [ids]);
    for (const item of series) {
      for (const map of item.maps) {
        await client.query(
          `INSERT INTO maps (id, series_id, map_name, navi_score, opponent_score, navi_won, vod, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [map.id, item.id, map.mapName, map.naviScore, map.opponentScore, map.naviWon, map.vod, map.position],
        );
      }
    }
    await client.query(
      "DELETE FROM series WHERE played_at >= $1 AND NOT (id = ANY($2::text[]))",
      [YEAR_START.toISOString(), ids],
    );

    for (const player of roster) {
      await client.query(
        `INSERT INTO players (
           id, nickname, real_name, country, role, is_coach, join_date, sort_order, active, liquipedia_url, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,NOW())
         ON CONFLICT (id) DO UPDATE SET
           nickname = EXCLUDED.nickname,
           real_name = EXCLUDED.real_name,
           country = EXCLUDED.country,
           role = EXCLUDED.role,
           is_coach = EXCLUDED.is_coach,
           join_date = EXCLUDED.join_date,
           sort_order = EXCLUDED.sort_order,
           active = TRUE,
           liquipedia_url = EXCLUDED.liquipedia_url,
           updated_at = NOW()`,
        [
          player.id,
          player.nickname,
          player.realName,
          player.country,
          player.role,
          player.isCoach,
          player.joinDate,
          player.sortOrder,
          player.url,
        ],
      );
    }
    await client.query("UPDATE players SET active = FALSE, updated_at = NOW() WHERE NOT (id = ANY($1::text[]))", [
      roster.map((player) => player.id),
    ]);

    for (const post of posts) {
      await client.query(
        `INSERT INTO posts (id, source, author, title, body, url, published_at, tone, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (id) DO UPDATE SET
           source = EXCLUDED.source,
           author = EXCLUDED.author,
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           url = EXCLUDED.url,
           published_at = EXCLUDED.published_at,
           tone = EXCLUDED.tone,
           updated_at = NOW()`,
        [post.id, post.source, post.author, post.title, post.body, post.url, post.publishedAt, post.tone],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function collectPosts(wiki: string, roster: PlayerRow[]): Promise<PostDraft[]> {
  const channels = new Set<string>();
  for (const slug of telegramSlugsFromWiki(wiki)) channels.add(slug);
  const titles = ["Natus Vincere", ...roster.map((player) => player.id)];
  const linked = await fetchTelegramLinks(titles);
  for (const slugs of linked.values()) {
    for (const slug of slugs) channels.add(slug);
  }
  for (const match of wiki.matchAll(/https?:\/\/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,64})/g)) {
    const slug = telegramSlug(`https://t.me/${match[1]}`);
    if (slug) channels.add(slug);
  }

    const settled = await Promise.allSettled([...channels].map((channel) => fetchTelegramChannel(channel)));
    const posts: PostDraft[] = [];
  const failures: string[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") posts.push(...result.value);
    else failures.push(result.reason instanceof Error ? result.reason.message : "Telegram");
  }
  if (channels.size > 0 && failures.length === channels.size) {
    throw new Error(failures[0] || "Telegram недоступний");
  }
  const seen = new Set<string>();
  return posts.filter((post) => {
    if (seen.has(post.url)) return false;
    seen.add(post.url);
    return true;
  });
}

export async function runSync(): Promise<SyncSummary> {
  const client = await getPool().connect();
  let locked = false;
  try {
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(42026) AS locked");
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) throw new Error("Оновлення вже виконується");
    await ensureSchema(client);

    const newsPromise = fetchNaviNews();
    const bundle = await fetchSeasonBundle();
    let wiki = bundle.wiki;
    if (!wiki.includes("==Player Roster==")) wiki = await fetchTeamWiki();
    const squad = parseActiveRoster(wiki);
    if (!squad.length) throw new Error("Liquipedia не віддала активний склад");

    const people = await fetchPlayers(squad.map((person) => person.id));
    const roster = mergeRoster(squad, people);
    const series = bundle.matches
      .map((match) => normalizeMatch(match))
      .filter((match): match is StoredSeries => Boolean(match))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (!series.length) throw new Error("Liquipedia не віддала матчі сезону 2026");

    const bands = withBands(series, bundle.forms);
    const posts = [...(await newsPromise), ...(await collectPosts(wiki, roster))];

    await writeAll(client, series, bands, roster, posts);
    const summary: SyncSummary = {
      matches: series.length,
      upcoming: series.filter((item) => !item.finished).length,
      roster: roster.length,
      maps: series.reduce((sum, item) => sum + item.maps.length, 0),
      posts: posts.length,
      opponents: [...new Set(series.filter((item) => !item.finished).map((item) => item.opponentName))],
    };
    await client.query(
      "INSERT INTO sync_runs (finished_at, ok, summary) VALUES (NOW(), TRUE, $1::jsonb)",
      [JSON.stringify(summary)],
    );
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync failed";
    try {
      await client.query(
        "INSERT INTO sync_runs (finished_at, ok, summary) VALUES (NOW(), FALSE, $1::jsonb)",
        [JSON.stringify({ error: message.slice(0, 500) })],
      );
    } catch {
      /* schema may not exist yet */
    }
    throw error;
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock(42026)").catch(() => undefined);
    }
    client.release();
  }
}
