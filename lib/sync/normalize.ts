import { tierLabel } from "../format";
import type { MatchStatus, ResultKind } from "../match-status";
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
  adr?: number | null;
  rating?: number | null;
  maps?: number | null;
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
  dataIssues: string[];
  status: MatchStatus;
  resultKind: ResultKind;
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

export function scoreValue(value: unknown): number | null {
  if (value == null || typeof value === "boolean" || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number.isInteger(parsed) ? parsed : null;
}

export function matchDate(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const iso = value.trim().replace(" ", "T");
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function matchStatus(raw: RawMatch): MatchStatus {
  const status = String(raw.status ?? raw.extradata?.status ?? "").toLowerCase();
  if (/^(cancelled|canceled)$/.test(status)) return "cancelled";
  if (status === "postponed") return "postponed";
  if (isFinished(raw) || status === "finished") return "finished";
  if (/^(running|live|ongoing)$/.test(status)) return "running";
  return !status || /^(scheduled|not_started)$/.test(status) ? "scheduled" : "unknown";
}

export function isWalkover(raw: RawMatch): boolean {
  return [true, 1, "1", "true"].includes(raw.walkover ?? false) ||
    /^(walkover|forfeit|wo)$/i.test(String(raw.extradata?.resulttype ?? "")) ||
    asArray<RawOpponent>(raw.match2opponents).some((side) =>
      /^(ff|forfeit|dq|disqualified|wo|walkover)$/i.test(String(side.status ?? "")) ||
      /^(w|ff|dq|wo)$/i.test(String(side.score ?? "")));
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

export function normalizeMatch(raw: RawMatch, team: TeamProfile = NAVI, asOf = new Date()): StoredSeries | null {
  const id = clean(raw.match2id);
  const when = clean(raw.date);
  if (!id || !when) return null;
  const at = matchDate(when);
  if (!at) return null;
  const opponents = asArray<RawOpponent>(raw.match2opponents);
  if (opponents.length !== 2) return null;
  const naviIndex = opponents.findIndex((opponent) =>
    isTrackedSide(opponent, team.name, team.templatePrefix),
  );
  if (naviIndex < 0) return null;
  const opponent = opponents.find((side, index) => index !== naviIndex);
  if (!opponent || !clean(opponent.name)) return null;

  let status = matchStatus(raw);
  const dataIssues: string[] = [];
  const futureResult = status === "finished" && at.getTime() > asOf.getTime() + 5 * 60000;
  if (futureResult) {
    status = "unknown";
    dataIssues.push("Джерело вказало завершений результат для майбутнього матчу");
  }
  const finished = status === "finished";
  const naviScore = finished ? scoreValue(opponents[naviIndex]?.score) : null;
  const opponentScore = finished ? scoreValue(opponent.score) : null;
  let naviWon: boolean | null = null;
  if (finished) {
    const winner = Number(raw.winner);
    if (winner === 1 || winner === 2) naviWon = winner - 1 === naviIndex;
    else if (naviScore != null && opponentScore != null && naviScore !== opponentScore) {
      naviWon = naviScore > opponentScore;
    }
  }
  if (naviWon != null && !isWalkover(raw) && naviScore != null && opponentScore != null &&
    (naviScore === opponentScore || naviWon !== (naviScore > opponentScore))) {
    dataIssues.push("Переможець у джерелі суперечить рахунку");
    naviWon = null;
  }
  const resultKind: ResultKind = !finished ? "unknown" : isWalkover(raw) ? "walkover" :
    naviWon != null ? "played" : !dataIssues.length && naviScore != null && naviScore > 0 && naviScore === opponentScore &&
      Number(raw.bestof) % 2 === 0 && naviScore + opponentScore === Number(raw.bestof) ? "draw" : "unknown";

  const best = Number(raw.bestof);
  const maps = asArray<RawGame>(raw.match2games).map((game, index) => {
    const scores = futureResult ? {navi:null,opp:null} : mapScores(game, naviIndex);
    const winner = Number(game.winner);
    let won: boolean | null = null;
    const gameFinished = !futureResult && (finished || String(game.finished) === "1" || game.finished === true);
    if (gameFinished && (winner === 1 || winner === 2)) won = winner - 1 === naviIndex;
    else if (gameFinished && scores.navi != null && scores.opp != null && scores.navi !== scores.opp) {
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

  return {
    dataIssues,
    status,
    resultKind,
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
    if (matchStatus(match) !== "finished" || isWalkover(match)) continue;
    const opponents = asArray<RawOpponent>(match.match2opponents);
    const index = opponents.findIndex((opponent) => sameSide(opponent, side));
    if (index < 0) continue;
    const winner = Number(match.winner);
    if (winner === 1 || winner === 2) {
      if (winner - 1 === index) line.wins += 1;
      else line.losses += 1;
    } else {
      const left = scoreValue(opponents[index]?.score);
      const right = scoreValue(opponents[index === 0 ? 1 : 0]?.score);
      if (left == null || right == null) continue;
      if (left > right) line.wins += 1;
      else if (left < right) line.losses += 1;
      else line.draws += 1;
    }
  }
  return line;
}

export function mapsFromSeries(series: StoredSeries[]): MapSample[] {
  const bucket = new Map<string, MapSample>();
  for (const item of series) {
    if (!item.finished || item.resultKind === "walkover" || item.resultKind === "unknown") continue;
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
    if (matchStatus(match) !== "finished" || isWalkover(match)) continue;
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
