export type RawPlayer = {
  name?: string;
  displayname?: string;
  flag?: string;
  extradata?: unknown;
};

export type RawOpponent = {
  name?: string;
  template?: string;
  score?: string | number;
  status?: string;
  placement?: string | number;
  match2players?: RawPlayer[] | Record<string, RawPlayer>;
};

export type RawGame = {
  match2gameid?: string | number;
  map?: string;
  winner?: string | number;
  scores?: Array<string | number>;
  vod?: string;
  walkover?: string;
  opponents?: Array<{ score?: string | number; status?: string }>;
  extradata?: unknown;
};

export type RawMatch = {
  match2id?: string;
  pagename?: string;
  date?: string;
  winner?: string | number;
  tournament?: string;
  section?: string;
  bestof?: string | number;
  finished?: string | number | boolean;
  type?: string;
  liquipediatier?: string | number;
  liquipediatiertype?: string;
  vod?: string;
  match2opponents?: RawOpponent[] | Record<string, RawOpponent>;
  match2games?: RawGame[] | Record<string, RawGame>;
};

export type RawPerson = {
  pagename?: string;
  id?: string;
  name?: string;
  nationality?: string;
  extradata?: unknown;
};

export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") return Object.values(value as Record<string, T>);
  return [];
}

export function isNaviSide(opponent: RawOpponent): boolean {
  const name = (opponent.name || "").toLowerCase();
  const template = (opponent.template || "").toLowerCase();
  return name === "natus vincere" || template.startsWith("natus vincere");
}

export function isFinished(match: RawMatch): boolean {
  return String(match.finished) === "1" || match.finished === true;
}

function countStat(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    const parsed = Number(value);
    return parsed >= 0 ? Math.round(parsed) : null;
  }
  return null;
}

export function readKillDeath(extradata: unknown): { kills: number | null; deaths: number | null } {
  if (!extradata || typeof extradata !== "object" || Array.isArray(extradata)) {
    return { kills: null, deaths: null };
  }
  const record = extradata as Record<string, unknown>;
  const kills = countStat(record.kills ?? record.k);
  const deaths = countStat(record.deaths ?? record.d);
  if (kills == null || deaths == null) return { kills: null, deaths: null };
  return { kills, deaths };
}

export type SideRef = {
  name: string;
  template: string;
};

export function sameSide(opponent: RawOpponent, side: SideRef): boolean {
  const name = (opponent.name || "").toLowerCase();
  const template = (opponent.template || "").toLowerCase();
  if (side.name && name === side.name.toLowerCase()) return true;
  if (side.template && template && template === side.template.toLowerCase()) return true;
  return false;
}
