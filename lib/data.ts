import { cache } from "react";
import { query } from "./db";
import { eventLabel } from "./format";
import type { MapVM, PersonInMatch, PlayerVM, PostVM, SeriesVM } from "./types";

type SeriesRow = {
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
  }));
}

export const getAllSeries = cache(async (): Promise<SeriesVM[]> => {
  const [series, maps] = await Promise.all([
    query<SeriesRow>("SELECT * FROM series ORDER BY played_at DESC"),
    query<MapRow>("SELECT * FROM maps ORDER BY position ASC"),
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
    naviPlayers: people(row.navi_players),
    oppPlayers: people(row.opponent_players),
    maps: bySeries.get(row.id) ?? [],
  }));
});

export const getPlayers = cache(async (): Promise<PlayerVM[]> => {
  const rows = await query<{
    id: string;
    nickname: string;
    real_name: string | null;
    country: string | null;
    role: string | null;
    is_coach: boolean;
    join_date: Date | string | null;
    liquipedia_url: string | null;
  }>("SELECT * FROM players WHERE active = TRUE ORDER BY is_coach ASC, sort_order ASC, nickname ASC");
  return rows.map((row) => ({
    id: row.id,
    nickname: row.nickname,
    realName: row.real_name,
    country: row.country,
    role: row.role,
    isCoach: row.is_coach,
    joinDate: row.join_date ? String(row.join_date).slice(0, 10) : null,
    url: row.liquipedia_url,
  }));
});

export const getPosts = cache(async (): Promise<PostVM[]> => {
  const rows = await query<{
    id: string;
    source: string;
    author: string;
    title: string | null;
    body: string | null;
    url: string;
    published_at: Date | null;
    tone: PostVM["tone"];
  }>("SELECT * FROM posts ORDER BY published_at DESC NULLS LAST LIMIT 40");
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
