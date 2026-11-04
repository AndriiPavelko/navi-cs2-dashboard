import type { PoolClient } from "pg";
import { ensureSchema, getPool } from "../db";
import { forecast } from "../forecast";
import { TEAM_LIST, type TeamId, type TeamProfile } from "../teams";
import { verifyMatch, type SecondaryMatch } from "../verification";
import { fetchPlayers, fetchSeasonBundle, fetchTeamWiki, fetchTelegramLinks, type SeasonBundle } from "./liquipedia";
import { normalizeMatch, type StoredSeries } from "./normalize";
import { deduplicatePosts, fetchFazeNews, fetchNaviNews, fetchTelegramChannel, relevantPost, type PostDraft } from "./posts";
import { fetchSecondaryMatches } from "./pandascore";
import { FLAG_COUNTRY, lpdbRoleOf, normalizeRole, parseActiveRoster, telegramSlugsFromWiki, type SquadPerson } from "./roster";
import type { RawPerson } from "./raw";
import { isDue, type Scope, type SourceCheck } from "./schedule";
import { updateDigest } from "./summary";
import { usesBo3, primaryLabel } from "../sources";
import { bandMissedSide } from "../chance";
import { applyNames, fetchRoster, fetchSeason, opponentSlug, statWindow, type RosterPlayer, type SideSeries } from "./bo3";
import { prepareTeam, type Prepared } from "./prepare";

export type SyncSummary = {
  matches: number; upcoming: number; roster: number; maps: number; posts: number; opponents: string[];
  warnings: string[]; errors: string[]; skipped: number;
};

export type PlayerRow = { id: string; nickname: string; realName: string | null; country: string | null; role: string;
  isCoach: boolean; joinDate: string | null; sortOrder: number; url: string;
  kills?:number|null; deaths?:number|null; adr?:number|null; rating?:number|null; maps?:number|null };

function rosterRows(people: RosterPlayer[]): PlayerRow[] {
  return people.map((p,index) => ({id:p.id,nickname:p.nick,realName:p.realName,country:null,role:p.isCoach ? "coach":"player",
    isCoach:p.isCoach,joinDate:null,sortOrder:index,url:p.url,kills:p.isCoach ? null:p.kills,deaths:p.isCoach ? null:p.deaths,
    adr:p.adr,rating:p.rating,maps:p.maps}));
}

function mergeRoster(squad: SquadPerson[], people: RawPerson[]): PlayerRow[] {
  return squad.map((person, index) => {
    const lp = people.find((item) => (item.id || "").toLowerCase() === person.id.toLowerCase());
    const role = normalizeRole(person.role, person.igl, lpdbRoleOf(lp?.extradata));
    const page = lp?.pagename || person.id;
    return { id: page, nickname: lp?.id || person.id, realName: lp?.name || person.name || null,
      country: FLAG_COUNTRY[person.flag] || lp?.nationality || null, role, isCoach: role === "coach",
      joinDate: person.joinDate, sortOrder: index,
      url: `https://liquipedia.net/counterstrike/${encodeURIComponent(page.replace(/ /g, "_"))}` };
  });
}

async function transaction(client: PoolClient, work: () => Promise<void>) {
  await client.query("BEGIN");
  try { await work(); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
}

export function protectsResult(previous: { finished: boolean; result_kind: string; navi_score?: number | null; opponent_score?: number | null }, item: StoredSeries): boolean {
  return previous.finished && item.status !== "cancelled" &&
    (!item.finished || (previous.result_kind !== "unknown" && item.resultKind === "unknown") ||
      (previous.navi_score != null && item.naviScore == null) || (previous.opponent_score != null && item.opponentScore == null));
}

export async function writeMatches(client: PoolClient, team: TeamProfile, series: StoredSeries[], bundle: SeasonBundle,
  secondary: SecondaryMatch[], checkedAt: string, warnings: string[], prepared: Prepared[] = []) {
  await transaction(client, async () => {
    const previous = await client.query<{ id: string; finished: boolean; result_kind: string; navi_score:number|null; opponent_score:number|null }>(
      "SELECT id, finished, result_kind, navi_score, opponent_score FROM series WHERE team = $1", [team.id]);
    const old = new Map(previous.rows.map((row) => [row.id, row]));
    const enriched = new Map(prepared.map((item) => [item.series.id,item]));
    const active = (await client.query<{id:string;nickname:string}>("SELECT id,nickname FROM players WHERE team=$1 AND active=TRUE AND NOT is_coach",[team.id])).rows;
    // Missing rows are retained, and excluded from the active schedule until seen again.
    await client.query(`UPDATE series SET source_missing = TRUE WHERE team = $1 AND NOT finished
      AND NOT (id = ANY($2::text[])) AND (COALESCE(page_name,'') LIKE 'https://bo3.gg/%')=$3`,
    [team.id, series.map((item) => item.id),series[0]?.pageName?.startsWith("https://bo3.gg/") ?? false]);
    for (const item of series) {
      const existing = old.get(item.id);
      if (existing && protectsResult(existing, item)) {
        warnings.push(`Збережено попередній результат ${item.opponentName}: нова відповідь неповна`);
        continue;
      }
      const verification = verifyMatch(item, team, secondary, checkedAt);
      const history = Object.entries(bundle.forms).find(([name]) => name.toLowerCase() === item.opponentName.toLowerCase())?.[1] ?? [];
      const forModel = item.naviPlayers.length >= 5 || active.length < 5 ? item : { ...item,
        naviPlayers:active.map((p) => ({name:p.id,displayname:p.nickname,flag:"",kills:null,deaths:null})) };
      const details = enriched.get(item.id);
      const band = item.status === "scheduled" && verification.state !== "conflict"
        ? details && details.winLow != null && details.winHigh != null
          ? { low:details.winLow,high:details.winHigh,reasons:details.winReasons ?? [] }
          : forecast(forModel, series, history, team.label, new Date(checkedAt)) : null;
      await client.query(`INSERT INTO series (
        team,id,played_at,tournament,section,tier,event_type,best_of,page_name,opponent_name,opponent_template,
        navi_score,opponent_score,navi_won,finished,navi_players,opponent_players,win_low,win_high,win_reasons,
        status,result_kind,source_missing,verification,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,$20::jsonb,$21,$22,FALSE,$23::jsonb,$24)
      ON CONFLICT (team,id) DO UPDATE SET played_at=EXCLUDED.played_at,tournament=EXCLUDED.tournament,
        section=EXCLUDED.section,tier=EXCLUDED.tier,event_type=EXCLUDED.event_type,best_of=EXCLUDED.best_of,
        page_name=EXCLUDED.page_name,opponent_name=EXCLUDED.opponent_name,opponent_template=EXCLUDED.opponent_template,
        navi_score=EXCLUDED.navi_score,opponent_score=EXCLUDED.opponent_score,navi_won=EXCLUDED.navi_won,
        finished=EXCLUDED.finished,
        navi_players=CASE WHEN EXCLUDED.navi_players='[]'::jsonb AND NOT (EXCLUDED.finished AND COALESCE(EXCLUDED.page_name,'') LIKE 'https://bo3.gg/%') THEN series.navi_players ELSE EXCLUDED.navi_players END,
        opponent_players=CASE WHEN EXCLUDED.opponent_players='[]'::jsonb AND NOT (EXCLUDED.finished AND COALESCE(EXCLUDED.page_name,'') LIKE 'https://bo3.gg/%') THEN series.opponent_players ELSE EXCLUDED.opponent_players END,
        win_low=EXCLUDED.win_low,win_high=EXCLUDED.win_high,win_reasons=EXCLUDED.win_reasons,
        maps_low=NULL,maps_high=NULL,maps_reasons=NULL,status=EXCLUDED.status,result_kind=EXCLUDED.result_kind,
        source_missing=FALSE,verification=EXCLUDED.verification,updated_at=EXCLUDED.updated_at`,
      [team.id,item.id,item.at.toISOString(),item.tournament,item.section,item.tier,item.eventType,item.bestOf,item.pageName,
        item.opponentName,item.opponentTemplate,item.naviScore,item.opponentScore,item.naviWon,item.finished,
        JSON.stringify(item.naviPlayers),JSON.stringify(item.opponentPlayers),band?.low ?? null,band?.high ?? null,
        JSON.stringify(band?.reasons ?? []),item.status,item.resultKind,JSON.stringify(verification),checkedAt]);
      if (details) {
        const stored = (await client.query<{old_source:string|null;old_low:number|null;old_high:number|null}>(
          "SELECT old_source,old_low,old_high FROM series WHERE team=$1 AND id=$2",[team.id,item.id])).rows[0];
        const keep = item.finished && stored?.old_source === "stored" && stored.old_low != null && stored.old_high != null;
        const oldMiss = keep && item.naviWon != null ? bandMissedSide(stored.old_low!,stored.old_high!,item.naviWon) : details.oldMiss;
        await client.query(`UPDATE series SET maps_low=$3,maps_high=$4,maps_reasons=$5::jsonb,chain=$6,
          old_low=CASE WHEN $7 THEN old_low ELSE $8 END,old_high=CASE WHEN $7 THEN old_high ELSE $9 END,
          old_reasons=CASE WHEN $7 THEN old_reasons ELSE $10::jsonb END,old_source=CASE WHEN $7 THEN old_source ELSE $11 END,
          old_miss=$12,old_note=CASE WHEN $7 THEN old_note ELSE $13 END WHERE team=$1 AND id=$2`,
        [team.id,item.id,details.mapsLow,details.mapsHigh,JSON.stringify(details.mapReasons),details.chain,keep,
          details.oldLow,details.oldHigh,JSON.stringify(details.oldReasons),details.oldSource,oldMiss,details.oldNote]);
      }
      // Upsert available maps; an incomplete response must not erase previously received scores.
      for (const map of item.maps) {
        await client.query(`INSERT INTO maps (team,id,series_id,map_name,navi_score,opponent_score,navi_won,vod,position)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (id) DO UPDATE SET map_name=EXCLUDED.map_name,
            navi_score=COALESCE(EXCLUDED.navi_score,maps.navi_score),opponent_score=COALESCE(EXCLUDED.opponent_score,maps.opponent_score),
            navi_won=COALESCE(EXCLUDED.navi_won,maps.navi_won),vod=COALESCE(EXCLUDED.vod,maps.vod),position=EXCLUDED.position`,
        [team.id,map.id,item.id,map.mapName,map.naviScore,map.opponentScore,map.naviWon,map.vod,map.position]);
      }
    }
  });
}

export async function writeRoster(client: PoolClient, team: TeamId, roster: PlayerRow[]) {
  const playing = roster.filter((player) => !player.isCoach);
  if (playing.length < 5 || playing.length > 10 || new Set(roster.map((p) => p.id)).size !== roster.length) {
    throw new Error("Неповний або неоднозначний склад; попередній склад збережено");
  }
  await transaction(client, async () => {
    for (const player of roster) {
      await client.query(`INSERT INTO players (team,id,nickname,real_name,country,role,is_coach,join_date,sort_order,active,liquipedia_url,kills,deaths,adr,bo3_rating,maps_played,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11,$12,$13,$14,$15,NOW())
        ON CONFLICT (team,id) DO UPDATE SET nickname=EXCLUDED.nickname,real_name=EXCLUDED.real_name,country=EXCLUDED.country,
          role=EXCLUDED.role,is_coach=EXCLUDED.is_coach,join_date=EXCLUDED.join_date,sort_order=EXCLUDED.sort_order,
          active=TRUE,liquipedia_url=EXCLUDED.liquipedia_url,kills=EXCLUDED.kills,deaths=EXCLUDED.deaths,adr=EXCLUDED.adr,
          bo3_rating=EXCLUDED.bo3_rating,maps_played=EXCLUDED.maps_played,updated_at=NOW()`,
      [team,player.id,player.nickname,player.realName,player.country,player.role,player.isCoach,player.joinDate,player.sortOrder,player.url,
        player.kills ?? null,player.deaths ?? null,player.adr ?? null,player.rating ?? null,player.maps ?? null]);
    }
    await client.query("UPDATE players SET active=FALSE WHERE team=$1 AND NOT (id=ANY($2::text[]))", [team,roster.map((p) => p.id)]);
  });
}

async function collectPosts(team: TeamProfile, wiki: string, roster: Array<{ id: string; nickname: string }>) {
  const warnings: string[] = [];
  const channels = new Set(telegramSlugsFromWiki(wiki));
  try {
    const linked = await fetchTelegramLinks([team.page,...roster.map((p) => p.id)]);
    for (const slugs of linked.values()) for (const slug of slugs) channels.add(slug);
  } catch { warnings.push("Не вдалося перевірити посилання Telegram"); }
  const requests = [team.id === "navi" ? fetchNaviNews() : fetchFazeNews(),
    ...[...channels].map((channel) => fetchTelegramChannel(channel))];
  const results = await Promise.allSettled(requests);
  const posts: PostDraft[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") posts.push(...result.value);
    else warnings.push(`${index === 0 ? "Новини клубу" : "Telegram"}: ${errorText(result.reason)}`);
  }
  if (results.every((r) => r.status === "rejected")) throw new Error("Джерела новин недоступні; попередні дописи збережено");
  const relevant = deduplicatePosts(posts.filter((post) => relevantPost(post,roster.map((p) => p.nickname))));
  if (team.id === "faze" && !relevant.some((p) => p.source === "fazeclan.com")) warnings.push("В офіційній Atom-стрічці FaZe немає новин CS2; покриття обмежене доступними каналами");
  return { posts: relevant, warnings };
}

export async function writePosts(client: PoolClient, team: TeamId, posts: PostDraft[]) {
  await transaction(client, async () => {
    for (const post of posts) await client.query(`INSERT INTO posts (team,id,source,author,title,body,url,published_at,tone,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT (team,id) DO UPDATE SET source=EXCLUDED.source,
      author=EXCLUDED.author,title=EXCLUDED.title,body=EXCLUDED.body,url=EXCLUDED.url,published_at=EXCLUDED.published_at,
      tone=EXCLUDED.tone,updated_at=NOW()`,
    [team,post.id,post.source,post.author,post.title,post.body,post.url,post.publishedAt,post.tone]);
  });
}

function errorText(error: unknown): string {
  // Do not echo upstream response bodies, database URLs or tokens into the UI/log.
  return error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[джерело]").slice(0,300) : "Помилка джерела";
}

export async function runSync({ force = false }: { force?: boolean } = {}, suppliedClient?: PoolClient): Promise<SyncSummary> {
  const client = suppliedClient ?? await getPool().connect();
  let locked = false;
  const summary: SyncSummary = { matches:0,upcoming:0,roster:0,maps:0,posts:0,opponents:[],warnings:[],errors:[],skipped:0 };
  try {
    locked = Boolean((await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(42026) AS locked")).rows[0]?.locked);
    if (!locked) throw new Error("Оновлення вже виконується");
    await ensureSchema(client);
    for (const team of TEAM_LIST) {
      let bundle: SeasonBundle | undefined;
      let wiki: string | undefined;
      let squadBo3: RosterPlayer[] | undefined;
      const window = statWindow();
      let changed = false;
      for (const scope of ["matches","roster","posts"] as Scope[]) {
        const check = (await client.query<SourceCheck>(`SELECT team,scope,attempted_at::text AS "attemptedAt",succeeded_at::text AS "succeededAt",error,warnings
          FROM source_checks WHERE team=$1 AND scope=$2`, [team.id,scope])).rows[0];
        const now = new Date();
        if (!isDue(scope,check,now,force)) { summary.skipped++; continue; }
        const warnings: string[] = [];
        let error: string | null = null;
        try {
          if (scope === "matches") {
            let prepared: Prepared[] = [];
            let series: StoredSeries[];
            if (usesBo3()) {
              const own = await fetchSeason(team.bo3Id);
              const upcoming = own.filter((item) => !item.finished && (!item.status || item.status === "scheduled" || item.status === "running"));
              const recent = own.filter((item) => item.finished).sort((a,b) => b.at.localeCompare(a.at));
              const needed = new Set([...upcoming,...(team.id === "navi" ? recent.slice(0,10):[])].map((item) => item.opponentId));
              const opponents = new Map<number,SideSeries[]>();
              for (const id of needed) {
                try { opponents.set(id,applyNames(await fetchSeason(id))); }
                catch { warnings.push(`Не вдалося оновити форму суперника ${id}; результати команди збережено`); }
              }
              const rosters = new Map<number,RosterPlayer[]>();
              try { squadBo3 = await fetchRoster(team.bo3Slug,window);rosters.set(team.bo3Id,squadBo3); }
              catch { warnings.push("Статистика складу недоступна; матчі оновлюються окремо"); }
              for (const item of upcoming) {
                if (rosters.has(item.opponentId)) continue;
                const slug = opponentSlug(item.id,team.bo3Slug);
                if (!slug) continue;
                try { rosters.set(item.opponentId,await fetchRoster(slug,window)); }
                catch { warnings.push(`Статистика гравців ${item.opponentName} недоступна`); }
              }
              prepared = prepareTeam({label:team.label,own:applyNames(own),opponents,rosters,windowLabel:window.label,replayLimit:team.id === "navi" ? 10:0});
              series = prepared.map((item) => item.series);
              bundle = { matches:[],forms:{},wiki:"" };
            } else {
              bundle = await fetchSeasonBundle(team);
              wiki = bundle.wiki || undefined;
              series = bundle.matches.map((row) => normalizeMatch(row,team)).filter((row): row is StoredSeries => Boolean(row));
            }
            if (!series.length || new Set(series.map((s) => s.id)).size !== series.length) throw new Error("Порожня або неоднозначна вибірка матчів; історію збережено");
            if (!usesBo3() && series.length !== bundle.matches.length) warnings.push(`Пропущено неповних записів: ${bundle.matches.length-series.length}`);
            let secondary: SecondaryMatch[] = [];
            if (process.env.PANDASCORE_TOKEN) {
              try { secondary = await fetchSecondaryMatches(team); }
              catch (reason) { warnings.push(`Друге джерело недоступне: ${errorText(reason)}`); }
            } else warnings.push("PandaScore не підключено: матчі мають лише одне джерело");
            await writeMatches(client,team,series,bundle,secondary,new Date().toISOString(),warnings,prepared);
            summary.matches += series.length;
            summary.upcoming += series.filter((s) => s.status === "scheduled" || s.status === "running").length;
            summary.maps += series.reduce((n,s) => n+s.maps.length,0);
            summary.opponents.push(...series.filter((s) => s.status === "scheduled").map((s) => `${team.label}: ${s.opponentName}`));
          } else if (scope === "roster") {
            let roster: PlayerRow[];
            if (usesBo3()) {
              squadBo3 ??= await fetchRoster(team.bo3Slug,window);
              roster = rosterRows(squadBo3);
            } else {
            wiki ||= await fetchTeamWiki(team);
            const squad = parseActiveRoster(wiki);
            if (!squad.length) throw new Error("Liquipedia не віддала активний склад");
            roster = mergeRoster(squad,await fetchPlayers(squad.map((p) => p.id)));
            }
            await writeRoster(client,team.id,roster);
            summary.roster += roster.length;
            warnings.push(`Склад із ${primaryLabel()}; офіційного другого підтвердження немає`);
          } else {
            wiki ||= await fetchTeamWiki(team);
            const roster = (await client.query<{ id: string; nickname: string }>("SELECT id,nickname FROM players WHERE team=$1 AND active=TRUE",[team.id])).rows;
            const collected = await collectPosts(team,wiki,roster);
            warnings.push(...collected.warnings);
            await writePosts(client,team.id,collected.posts);
            summary.posts += collected.posts.length;
          }
          changed = true;
        } catch (reason) { error = errorText(reason); summary.errors.push(`${team.label} · ${scope}: ${error}`); }
        await client.query(`INSERT INTO source_checks (team,scope,attempted_at,succeeded_at,error,warnings)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (team,scope) DO UPDATE SET
          attempted_at=EXCLUDED.attempted_at,succeeded_at=COALESCE(EXCLUDED.succeeded_at,source_checks.succeeded_at),
          error=EXCLUDED.error,warnings=EXCLUDED.warnings`,
        [team.id,scope,now.toISOString(),error ? null : new Date().toISOString(),error,JSON.stringify(warnings)]);
        summary.warnings.push(...warnings.map((w) => `${team.label}: ${w}`));
      }
      if (changed) {
        try { await updateDigest(client,team); }
        catch (reason) { summary.warnings.push(`${team.label} · зведення: ${errorText(reason)}`); }
      }
    }
    await client.query("INSERT INTO sync_runs (finished_at,ok,summary) VALUES (NOW(),$1,$2::jsonb)",
      [summary.errors.length === 0,JSON.stringify(summary)]);
    return summary;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(42026)").catch(() => undefined);
    if (!suppliedClient) client.release();
  }
}
