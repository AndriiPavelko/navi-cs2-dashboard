import { cache } from "react";
import { query } from "./db";
import { eventLabel } from "./format";
import type { TeamId } from "./teams";
import type { MapVM, PersonInMatch, PlayerVM, PostVM, SeriesVM } from "./types";

type SeriesRow = {
  team: TeamId;
  id: string;
  played_at: Date;
  tournament: string;
  section: string | null;
  tier: string | null;
  event_type: string | null;
  best_of: number | null;
  page_name: string | null;
  opponent_name: string;
  navi_score: number | null;
  opponent_score: number | null;
  navi_won: boolean | null;
  finished: boolean;
  navi_players: PersonInMatch[] | null;
  opponent_players: PersonInMatch[] | null;
  win_low: number | null;
  win_high: number | null;
  win_reasons: string[] | null;
  chain: string | null;
  old_low: number | null;
  old_high: number | null;
  old_reasons: string[] | null;
  old_source: "stored" | "replay" | "shown" | null;
  old_miss: boolean | null;
  old_note: string | null;
  maps_low: number | null;
  maps_high: number | null;
  maps_reasons: string[] | null;
};

type MapRow = {
  id: string;
  series_id: string;
  map_name: string;
  navi_score: number | null;
  opponent_score: number | null;
  navi_won: boolean | null;
  vod: string | null;
  position: number;
};

function people(value: PersonInMatch[] | null): PersonInMatch[] {
  if (!Array.isArray(value)) return [];
  return value.map((person) => ({
    name: person.name || "",
    displayname: person.displayname || person.name || "",
    flag: person.flag || "",
    kills: person.kills ?? null,
    deaths: person.deaths ?? null,
    adr: person.adr ?? null,
    rating: person.rating ?? null,
    maps: person.maps ?? null,
  }));
}

export const getAllSeries = cache(async (team: TeamId): Promise<SeriesVM[]> => {
  const [series, maps] = await Promise.all([
    query<SeriesRow>("SELECT * FROM series WHERE team = $1 ORDER BY played_at DESC", [team]),
    query<MapRow>("SELECT * FROM maps WHERE team = $1 ORDER BY position ASC", [team]),
  ]);
  const bySeries = new Map<string, MapVM[]>();
  for (const map of maps) {
    const list = bySeries.get(map.series_id) ?? [];
    list.push({
      id: map.id,
      name: map.map_name,
      navi: map.navi_score,
      opp: map.opponent_score,
      naviWon: map.navi_won,
      vod: map.vod,
    });
    bySeries.set(map.series_id, list);
  }
  return series.map((row) => ({
    team: row.team,
    id: row.id,
    at: new Date(row.played_at).toISOString(),
    tournament: row.tournament,
    section: row.section,
    eventLabel: eventLabel(row.tournament, row.section),
    tier: row.tier,
    eventType: row.event_type,
    bestOf: row.best_of,
    pageName: row.page_name,
    opponent: row.opponent_name,
    naviScore: row.navi_score,
    oppScore: row.opponent_score,
    naviWon: row.navi_won,
    finished: row.finished,
    winLow: row.win_low,
    winHigh: row.win_high,
    reasons: Array.isArray(row.win_reasons) ? row.win_reasons : [],
    chain: row.chain,
    oldLow: row.old_low,
    oldHigh: row.old_high,
    oldReasons: Array.isArray(row.old_reasons) ? row.old_reasons : [],
    oldSource: row.old_source,
    oldMiss: row.old_miss,
    oldNote: row.old_note,
    mapsLow: row.maps_low,
    mapsHigh: row.maps_high,
    mapReasons: Array.isArray(row.maps_reasons) ? row.maps_reasons : [],
    naviPlayers: people(row.navi_players),
    oppPlayers: people(row.opponent_players),
    maps: bySeries.get(row.id) ?? [],
  }));
});

export const getPlayers = cache(async (team: TeamId): Promise<PlayerVM[]> => {
  const rows = await query<{
    id: string;
    nickname: string;
    real_name: string | null;
    country: string | null;
    role: string | null;
    is_coach: boolean;
    join_date: Date | string | null;
    liquipedia_url: string | null;
    kills: number | null;
    deaths: number | null;
    adr: number | null;
    bo3_rating: number | null;
    maps_played: number | null;
  }>("SELECT * FROM players WHERE team = $1 AND active = TRUE ORDER BY is_coach ASC, sort_order ASC, nickname ASC", [team]);
  return rows.map((row) => ({
    id: row.id,
    nickname: row.nickname,
    realName: row.real_name,
    country: row.country,
    role: row.role,
    isCoach: row.is_coach,
    joinDate: row.join_date ? String(row.join_date).slice(0, 10) : null,
    url: row.liquipedia_url,
    kills: row.kills,
    deaths: row.deaths,
    adr: row.adr == null ? null : Number(row.adr),
    rating: row.bo3_rating == null ? null : Number(row.bo3_rating),
    mapsPlayed: row.maps_played,
  }));
});

export const getPosts = cache(async (team: TeamId): Promise<PostVM[]> => {
  const rows = await query<{
    id: string;
    source: string;
    author: string;
    title: string | null;
    body: string | null;
    url: string;
    published_at: Date | null;
    tone: PostVM["tone"];
  }>("SELECT * FROM posts WHERE team = $1 ORDER BY published_at DESC NULLS LAST LIMIT 40", [team]);
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    author: row.author,
    title: row.title,
    body: row.body,
    url: row.url,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    tone: row.tone,
  }));
});

export const getLastSync = cache(async (): Promise<string | null> => {
  const rows = await query<{ finished_at: Date }>(
    "SELECT finished_at FROM sync_runs WHERE ok = TRUE ORDER BY finished_at DESC LIMIT 1",
  );
  const value = rows[0]?.finished_at;
  return value ? new Date(value).toISOString() : null;
});
