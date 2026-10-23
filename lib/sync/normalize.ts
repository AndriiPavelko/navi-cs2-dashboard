import { tierLabel } from "../format";
import { NAVI, type TeamProfile } from "../teams";
import type { MapSample, RecordLine } from "../winband";
import {
  asArray,
  isFinished,
  isTrackedSide,
  readKillDeath,
  sameSide,
  type RawGame,
  type RawMatch,
  type RawOpponent,
  type RawPlayer,
  type SideRef,
} from "./raw";

export type StoredPlayer = {
  name: string;
  displayname: string;
  flag: string;
  kills: number | null;
  deaths: number | null;
};

export type StoredMap = {
  id: string;
  mapName: string;
  naviScore: number | null;
  opponentScore: number | null;
  naviWon: boolean | null;
  vod: string | null;
  position: number;
};

export type StoredSeries = {
  id: string;
  at: Date;
  tournament: string;
  section: string | null;
  tier: string | null;
  eventType: string | null;
  bestOf: number | null;
  pageName: string | null;
  opponentName: string;
  opponentTemplate: string | null;
  naviScore: number | null;
  opponentScore: number | null;
  naviWon: boolean | null;
  finished: boolean;
  naviPlayers: StoredPlayer[];
  opponentPlayers: StoredPlayer[];
  maps: StoredMap[];
};

function scoreValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function playersOf(opponent: RawOpponent): StoredPlayer[] {
  return asArray<RawPlayer>(opponent.match2players).map((player) => {
    const kd = readKillDeath(player.extradata);
    return {
      name: clean(player.name),
      displayname: clean(player.displayname) || clean(player.name),
      flag: clean(player.flag),
      kills: kd.kills,
      deaths: kd.deaths,
    };
  });
}

function mapScores(game: RawGame, naviIndex: number): { navi: number | null; opp: number | null } {
  const scores = asArray<string | number>(game.scores);
  if (scores.length >= 2) {
    const navi = scoreValue(scores[naviIndex]);
    const opp = scoreValue(scores[naviIndex === 0 ? 1 : 0]);
    return { navi, opp };
  }
  const opponents = asArray<{ score?: string | number }>(game.opponents);
  if (opponents.length >= 2) {
    return {
      navi: scoreValue(opponents[naviIndex]?.score),
      opp: scoreValue(opponents[naviIndex === 0 ? 1 : 0]?.score),
    };
  }
  return { navi: null, opp: null };
}

export function normalizeMatch(raw: RawMatch, team: TeamProfile = NAVI): StoredSeries | null {
  const id = clean(raw.match2id);
  const when = clean(raw.date);
  if (!id || !when) return null;
  const opponents = asArray<RawOpponent>(raw.match2opponents);
  const naviIndex = opponents.findIndex((opponent) =>
    isTrackedSide(opponent, team.name, team.templatePrefix),
  );
  if (naviIndex < 0) return null;
  const opponent = opponents.find((side, index) => index !== naviIndex);
  if (!opponent || !clean(opponent.name)) return null;

  const finished = isFinished(raw);
  const naviScore = finished ? scoreValue(opponents[naviIndex]?.score) : null;
  const opponentScore = finished ? scoreValue(opponent.score) : null;
  let naviWon: boolean | null = null;
  if (finished) {
    const winner = Number(raw.winner);
    if (Number.isFinite(winner) && winner > 0) naviWon = winner - 1 === naviIndex;
    else if (naviScore != null && opponentScore != null && naviScore !== opponentScore) {
      naviWon = naviScore > opponentScore;
    }
  }

  const best = Number(raw.bestof);
  const maps = asArray<RawGame>(raw.match2games).map((game, index) => {
    const scores = mapScores(game, naviIndex);
    const winner = Number(game.winner);
    let won: boolean | null = null;
    if (Number.isFinite(winner) && winner > 0) won = winner - 1 === naviIndex;
    else if (scores.navi != null && scores.opp != null && scores.navi !== scores.opp) {
      won = scores.navi > scores.opp;
    }
    const gameId = game.match2gameid ?? index + 1;
    return {
      id: team.id === "navi" ? `${id}-${gameId}` : `${team.id}:${id}-${gameId}`,
      mapName: clean(game.map) || `Карта ${index + 1}`,
      naviScore: scores.navi,
      opponentScore: scores.opp,
      naviWon: won,
      vod: clean(game.vod) || null,
      position: index + 1,
    };
  });

  const at = new Date(when.replace(" ", "T") + "Z");
  if (Number.isNaN(at.getTime())) return null;

  return {
    id,
    at,
    tournament: clean(raw.tournament) || "Турнір",
    section: clean(raw.section) || null,
    tier: tierLabel(
      raw.liquipediatier == null ? null : String(raw.liquipediatier),
      raw.liquipediatiertype,
    ),
    eventType: clean(raw.type) || null,
    bestOf: Number.isFinite(best) && best > 0 ? best : null,
    pageName: clean(raw.pagename) || null,
    opponentName: clean(opponent.name),
    opponentTemplate: clean(opponent.template) || null,
    naviScore,
    opponentScore,
    naviWon,
    finished,
    naviPlayers: playersOf(opponents[naviIndex]),
    opponentPlayers: playersOf(opponent),
    maps,
  };
}

export function recordFromRaw(matches: RawMatch[], side: SideRef): RecordLine {
  const line: RecordLine = { wins: 0, losses: 0, draws: 0 };
  for (const match of matches) {
    if (!isFinished(match)) continue;
    const opponents = asArray<RawOpponent>(match.match2opponents);
    const index = opponents.findIndex((opponent) => sameSide(opponent, side));
    if (index < 0) continue;
    const winner = Number(match.winner);
    if (Number.isFinite(winner) && winner > 0) {
      if (winner - 1 === index) line.wins += 1;
      else line.losses += 1;
    } else line.draws += 1;
  }
  return line;
}

export function mapsFromSeries(series: StoredSeries[]): MapSample[] {
  const bucket = new Map<string, MapSample>();
  for (const item of series) {
    if (!item.finished) continue;
    for (const map of item.maps) {
      if (map.naviWon == null) continue;
      const key = map.mapName.toLowerCase();
      const sample = bucket.get(key) ?? { map: map.mapName, wins: 0, losses: 0 };
      if (map.naviWon) sample.wins += 1;
      else sample.losses += 1;
      bucket.set(key, sample);
    }
  }
  return [...bucket.values()];
}

export function mapsFromRaw(matches: RawMatch[], side: SideRef): MapSample[] {
  const bucket = new Map<string, MapSample>();
  for (const match of matches) {
    if (!isFinished(match)) continue;
    const opponents = asArray<RawOpponent>(match.match2opponents);
    const index = opponents.findIndex((opponent) => sameSide(opponent, side));
    if (index < 0) continue;
    for (const game of asArray<RawGame>(match.match2games)) {
      const name = clean(game.map);
      if (!name) continue;
      const winner = Number(game.winner);
      if (!Number.isFinite(winner) || winner <= 0) continue;
      const key = name.toLowerCase();
      const sample = bucket.get(key) ?? { map: name, wins: 0, losses: 0 };
      if (winner - 1 === index) sample.wins += 1;
      else sample.losses += 1;
      bucket.set(key, sample);
    }
  }
  return [...bucket.values()];
}
