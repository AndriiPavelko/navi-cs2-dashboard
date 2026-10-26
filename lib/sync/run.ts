import type { PoolClient } from "pg";
import { bandMissedSide } from "../chance";
import { ensureSchema, getPool } from "../db";
import { TEAM_LIST, type TeamId, type TeamProfile } from "../teams";
import { applyNames, fetchRoster, fetchSeason, opponentSlug, statWindow, type RosterPlayer, type SideSeries } from "./bo3";
import { fetchTeamWiki, fetchTelegramLinks, telegramSlug } from "./liquipedia";
import { fetchNaviNews, fetchTelegramChannel, type PostDraft } from "./posts";
import { prepareTeam, type Prepared } from "./prepare";
import { telegramSlugsFromWiki } from "./roster";

export type SyncSummary = {
  matches: number;
  upcoming: number;
  roster: number;
  maps: number;
  posts: number;
  opponents: string[];
};

const YEAR_START = new Date("2026-01-01T00:00:00Z");

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
  kills: number | null;
  deaths: number | null;
  adr: number | null;
  rating: number | null;
  maps: number | null;
};

function rosterRows(people: RosterPlayer[]): PlayerRow[] {
  return people.map((player, index) => ({
    id: player.id,
    nickname: player.nick,
    realName: player.realName,
    country: null,
    role: player.isCoach ? "coach" : "player",
    isCoach: player.isCoach,
    joinDate: null,
    sortOrder: index,
    url: player.url,
    kills: player.isCoach ? null : player.kills,
    deaths: player.isCoach ? null : player.deaths,
    adr: player.adr,
    rating: player.rating,
    maps: player.maps,
  }));
}

async function keepStoredBands(client: PoolClient, team: TeamId, prepared: Prepared[]): Promise<void> {
  const rows = await client.query<{
    id: string;
    old_low: number | null;
    old_high: number | null;
    old_reasons: string[] | null;
    old_source: "stored" | "replay" | "shown" | null;
    old_note: string | null;
  }>("SELECT id, old_low, old_high, old_reasons, old_source, old_note FROM series WHERE team = $1", [team]);
  const prev = new Map(rows.rows.map((row) => [row.id, row]));
  for (const item of prepared) {
    const old = prev.get(item.series.id);
    if (!item.series.finished || old?.old_source !== "stored" || old.old_low == null || old.old_high == null) continue;
    item.oldLow = old.old_low;
    item.oldHigh = old.old_high;
    item.oldReasons = Array.isArray(old.old_reasons) ? old.old_reasons : null;
    item.oldSource = "stored";
    item.oldNote = old.old_note;
    item.oldMiss = item.series.naviWon == null ? null : bandMissedSide(old.old_low, old.old_high, item.series.naviWon);
  }
}

async function writeAll(
  client: PoolClient,
  team: TeamId,
  prepared: Prepared[],
  roster: PlayerRow[],
  posts: PostDraft[],
): Promise<void> {
  await client.query("BEGIN");
  try {
    await keepStoredBands(client, team, prepared);
    for (const item of prepared) {
      const row = item.series;
      await client.query(
        `INSERT INTO series (
           team, id, played_at, tournament, section, tier, event_type, best_of, page_name,
           opponent_name, opponent_template, navi_score, opponent_score, navi_won, finished,
           navi_players, opponent_players, win_low, win_high, win_reasons,
           maps_low, maps_high, maps_reasons, chain,
           old_low, old_high, old_reasons, old_source, old_miss, old_note, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,
           $10,$11,$12,$13,$14,$15,
           $16::jsonb,$17::jsonb,$18,$19,$20::jsonb,
           $21,$22,$23::jsonb,$24,
           $25,$26,$27::jsonb,$28,$29,$30,NOW()
         )
         ON CONFLICT (team, id) DO UPDATE SET
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
           maps_low = EXCLUDED.maps_low,
           maps_high = EXCLUDED.maps_high,
           maps_reasons = EXCLUDED.maps_reasons,
           chain = EXCLUDED.chain,
           old_low = EXCLUDED.old_low,
           old_high = EXCLUDED.old_high,
           old_reasons = EXCLUDED.old_reasons,
           old_source = EXCLUDED.old_source,
           old_miss = EXCLUDED.old_miss,
           old_note = EXCLUDED.old_note,
           updated_at = NOW()`,
        [
          team,
          row.id,
          row.at.toISOString(),
          row.tournament,
          row.section,
          row.tier,
          row.eventType,
          row.bestOf,
          row.pageName,
          row.opponentName,
          row.opponentTemplate,
          row.naviScore,
          row.opponentScore,
          row.naviWon,
          row.finished,
          JSON.stringify(row.naviPlayers),
          JSON.stringify(row.opponentPlayers),
          item.winLow,
          item.winHigh,
          item.winReasons ? JSON.stringify(item.winReasons) : null,
          item.mapsLow,
          item.mapsHigh,
          item.mapReasons ? JSON.stringify(item.mapReasons) : null,
          item.chain,
          item.oldLow,
          item.oldHigh,
          item.oldReasons ? JSON.stringify(item.oldReasons) : null,
          item.oldSource,
          item.oldMiss,
          item.oldNote,
        ],
      );
    }

    const ids = prepared.map((item) => item.series.id);
    await client.query("DELETE FROM maps WHERE team = $1 AND series_id = ANY($2::text[])", [team, ids]);
    for (const item of prepared) {
      for (const map of item.series.maps) {
        await client.query(
          `INSERT INTO maps (team, id, series_id, map_name, navi_score, opponent_score, navi_won, vod, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [team, map.id, item.series.id, map.mapName, map.naviScore, map.opponentScore, map.naviWon, map.vod, map.position],
        );
      }
    }
    await client.query(
      "DELETE FROM series WHERE team = $1 AND played_at >= $2 AND NOT (id = ANY($3::text[]))",
      [team, YEAR_START.toISOString(), ids],
    );

    for (const player of roster) {
      await client.query(
        `INSERT INTO players (
           team, id, nickname, real_name, country, role, is_coach, join_date, sort_order, active, liquipedia_url,
           kills, deaths, adr, bo3_rating, maps_played, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11,$12,$13,$14,$15,NOW())
         ON CONFLICT (team, id) DO UPDATE SET
           nickname = EXCLUDED.nickname,
           real_name = EXCLUDED.real_name,
           country = EXCLUDED.country,
           role = EXCLUDED.role,
           is_coach = EXCLUDED.is_coach,
           join_date = EXCLUDED.join_date,
           sort_order = EXCLUDED.sort_order,
           active = TRUE,
           liquipedia_url = EXCLUDED.liquipedia_url,
           kills = EXCLUDED.kills,
           deaths = EXCLUDED.deaths,
           adr = EXCLUDED.adr,
           bo3_rating = EXCLUDED.bo3_rating,
           maps_played = EXCLUDED.maps_played,
           updated_at = NOW()`,
        [
          team,
          player.id,
          player.nickname,
          player.realName,
          player.country,
          player.role,
          player.isCoach,
          player.joinDate,
          player.sortOrder,
          player.url,
          player.kills,
          player.deaths,
          player.adr,
          player.rating,
          player.maps,
        ],
      );
    }
    await client.query(
      "UPDATE players SET active = FALSE, updated_at = NOW() WHERE team = $1 AND NOT (id = ANY($2::text[]))",
      [team, roster.map((player) => player.id)],
    );

    for (const post of posts) {
      await client.query(
        `INSERT INTO posts (team, id, source, author, title, body, url, published_at, tone, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (id) DO UPDATE SET
           team = EXCLUDED.team,
           source = EXCLUDED.source,
           author = EXCLUDED.author,
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           url = EXCLUDED.url,
           published_at = EXCLUDED.published_at,
           tone = EXCLUDED.tone,
           updated_at = NOW()`,
        [team, post.id, post.source, post.author, post.title, post.body, post.url, post.publishedAt, post.tone],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function collectPosts(team: TeamProfile, wiki: string, roster: PlayerRow[]): Promise<PostDraft[]> {
  const channels = new Set<string>();
  for (const slug of telegramSlugsFromWiki(wiki)) channels.add(slug);
  const titles = [team.page, ...roster.map((player) => player.id)];
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

    const window = statWindow();
    const newsPromise = fetchNaviNews().catch(() => [] as PostDraft[]);
    const summary: SyncSummary = {
      matches: 0,
      upcoming: 0,
      roster: 0,
      maps: 0,
      posts: 0,
      opponents: [],
    };
    for (const team of TEAM_LIST) {
      let own = await fetchSeason(team.bo3Id);
      const finished = own.filter((item) => item.finished).sort((a, b) => b.at.localeCompare(a.at));
      const upcoming = own.filter((item) => !item.finished);
      const need = new Set<number>();
      if (team.id === "navi") {
        for (const item of finished.slice(0, 10)) need.add(item.opponentId);
      }
      for (const item of upcoming) need.add(item.opponentId);
      const opponents = new Map<number, SideSeries[]>();
      for (const id of need) opponents.set(id, applyNames(await fetchSeason(id)));
      const squad = await fetchRoster(team.bo3Slug, window);
      const rosters = new Map<number, RosterPlayer[]>([[team.bo3Id, squad]]);
      for (const item of upcoming) {
        if (rosters.has(item.opponentId)) continue;
        const slug = opponentSlug(item.id, team.bo3Slug);
        if (!slug) continue;
        rosters.set(item.opponentId, await fetchRoster(slug, window));
      }
      own = applyNames(own);
      const prepared = prepareTeam({
        label: team.label,
        own,
        opponents,
        rosters,
        windowLabel: window.label,
        replayLimit: team.id === "navi" ? 10 : 0,
      });
      if (!prepared.length) throw new Error(`bo3.gg не віддав матчі ${team.label} за 2026`);
      const roster = rosterRows(squad);
      const posts: PostDraft[] = team.id === "navi" ? [...(await newsPromise)] : [];
      try {
        const wiki = await fetchTeamWiki(team);
        posts.push(...(await collectPosts(team, wiki, roster)));
      } catch {
        /* пульс лишається з попереднього синку, матчі важливіші */
      }
      await writeAll(client, team.id, prepared, roster, posts);
      summary.matches += prepared.length;
      summary.upcoming += prepared.filter((item) => !item.series.finished).length;
      summary.roster += roster.length;
      summary.maps += prepared.reduce((sum, item) => sum + item.series.maps.length, 0);
      summary.posts += posts.length;
      summary.opponents.push(
        ...prepared.filter((item) => !item.series.finished).map((item) => `${team.label}: ${item.series.opponentName}`),
      );
    }
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
