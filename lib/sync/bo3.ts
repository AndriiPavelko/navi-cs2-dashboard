import type { PlayerForm } from "../chance";

const API = "https://api.bo3.gg/api/v1";

const HEADERS = {
  accept: "application/json",
  origin: "https://bo3.gg",
  referer: "https://bo3.gg/",
  "user-agent": "NAVI-CS2-Dashboard/1.0 (personal non-commercial CS2 fan dashboard)",
};

type Bo3List<T> = { total?: { count?: number }; results?: T[] };

type Bo3Game = {
  map_name?: string | null;
  winner_clan_score?: number | null;
  loser_clan_score?: number | null;
  winner_clan_name?: string | null;
  loser_clan_name?: string | null;
  winner_team_clan?: { team_id?: number | null; team?: { id?: number | null } } | null;
  loser_team_clan?: { team_id?: number | null; team?: { id?: number | null } } | null;
  number?: number | null;
};

type Bo3Match = {
  id: number;
  slug: string;
  team1_id: number | null;
  team2_id: number | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: number | null;
  status: string;
  bo_type: number | null;
  start_date: string;
  tier?: string | null;
  tournament?: { name?: string | null } | null;
  games?: Bo3Game[] | null;
};

type Bo3Player = {
  id: number;
  slug: string;
  nickname: string;
  first_name?: string | null;
  last_name?: string | null;
  status?: number | null;
  is_coach?: boolean | null;
  six_month_avg_rating?: number | null;
  role?: string | null;
};

type Bo3Team = {
  id: number;
  slug: string;
  name: string;
  players?: Bo3Player[] | null;
};

type GeneralStats = {
  games_count?: number | null;
  kills_sum?: number | null;
  deaths_sum?: number | null;
  damage_sum?: number | null;
  rounds_count?: number | null;
};

export type SideSeries = {
  id: string;
  at: string;
  tournament: string;
  tier: string | null;
  bestOf: number | null;
  url: string;
  teamId: number;
  opponentId: number;
  opponentName: string;
  ownScore: number | null;
  oppScore: number | null;
  ownWon: boolean | null;
  finished: boolean;
  maps: { name: string; own: number | null; opp: number | null; ownWon: boolean | null; position: number }[];
};

export type RosterPlayer = PlayerForm & {
  id: string;
  realName: string | null;
  isCoach: boolean;
  url: string;
};

const names = new Map<number, string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bo3<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers: HEADERS, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`bo3.gg відповів ${response.status} на ${path.split("?")[0]}`);
  }
  await sleep(120);
  return (await response.json()) as T;
}

function teamIdOf(clan: Bo3Game["winner_team_clan"]): number | null {
  const id = clan?.team_id ?? clan?.team?.id;
  return typeof id === "number" ? id : null;
}

function remember(id: number | null | undefined, name: string | null | undefined): void {
  if (id == null || !name) return;
  if (!names.has(id)) names.set(id, name);
}

export function mapLabel(name: string): string {
  const raw = name.replace(/^de_/i, "").replace(/_/g, " ");
  if (!raw) return name;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function tierLabelOf(tier: string | null | undefined): string | null {
  if (!tier) return null;
  const key = tier.trim().toUpperCase();
  if (!key || key === "NULL") return null;
  return `${key}-tier`;
}

function normalize(match: Bo3Match, teamId: number): SideSeries | null {
  if (match.team1_id == null || match.team2_id == null) return null;
  if (match.team1_id !== teamId && match.team2_id !== teamId) return null;
  const opponentId = match.team1_id === teamId ? match.team2_id : match.team1_id;
  const ownIsFirst = match.team1_id === teamId;
  const finished = match.status === "finished" || match.status === "defwin";
  for (const game of match.games ?? []) {
    remember(teamIdOf(game.winner_team_clan), game.winner_clan_name);
    remember(teamIdOf(game.loser_team_clan), game.loser_clan_name);
  }
  const maps = (match.games ?? [])
    .filter((game) => game.map_name)
    .map((game, index) => {
      const winner = teamIdOf(game.winner_team_clan);
      const ownWon = winner == null ? null : winner === teamId;
      const own = ownWon == null ? null : ownWon ? game.winner_clan_score ?? null : game.loser_clan_score ?? null;
      const opp = ownWon == null ? null : ownWon ? game.loser_clan_score ?? null : game.winner_clan_score ?? null;
      return {
        name: mapLabel(game.map_name || "Карта"),
        own,
        opp,
        ownWon,
        position: game.number ?? index + 1,
      };
    })
    .sort((a, b) => a.position - b.position);
  const ownScore = ownIsFirst ? match.team1_score : match.team2_score;
  const oppScore = ownIsFirst ? match.team2_score : match.team1_score;
  return {
    id: match.slug,
    at: new Date(match.start_date).toISOString(),
    tournament: match.tournament?.name || "Турнір",
    tier: tierLabelOf(match.tier),
    bestOf: match.bo_type,
    url: `https://bo3.gg/matches/${match.slug}`,
    teamId,
    opponentId,
    opponentName: names.get(opponentId) || `Команда ${opponentId}`,
    ownScore: ownScore ?? null,
    oppScore: oppScore ?? null,
    ownWon: match.winner_team_id == null ? null : match.winner_team_id === teamId,
    finished,
    maps,
  };
}

async function matchesOf(teamId: number): Promise<SideSeries[]> {
  const rows: Bo3Match[] = [];
  for (const offset of [0, 80]) {
    const page = await bo3<Bo3List<Bo3Match>>(
      `/matches?filter[matches.team_ids][overlap]=${teamId}&filter[matches.status][in]=finished,defwin,upcoming,current&filter[matches.discipline_id][eq]=1&filter[matches.start_date][gt]=2025-12-31&page[limit]=80&page[offset]=${offset}&sort=-start_date&with=games,tournament`,
    );
    rows.push(...(page.results ?? []));
    if ((page.total?.count ?? 0) <= rows.length) break;
  }
  const series = rows
    .map((match) => normalize(match, teamId))
    .filter((match): match is SideSeries => Boolean(match));
  const seen = new Set<string>();
  return series.filter((match) => {
    if (seen.has(match.id)) return false;
    seen.add(match.id);
    return true;
  });
}

export async function fetchTeam(slug: string): Promise<Bo3Team> {
  const team = await bo3<Bo3Team>(`/teams/${slug}`);
  names.set(team.id, team.name);
  return team;
}

const UK_MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];

function ukDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(date)} ${UK_MONTHS[Number(month) - 1] ?? month}`;
}

export function statWindow(now = new Date()): { from: string; to: string; label: string } {
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const from = start.toISOString().slice(0, 10);
  return { from, to, label: `${ukDay(from)} – ${ukDay(to)}` };
}

async function playerForm(player: Bo3Player, window: { from: string; to: string }): Promise<PlayerForm | null> {
  const stats = await bo3<GeneralStats | null>(
    `/players/${player.slug}/general_stats?filter[start_date_from]=${window.from}&filter[start_date_to]=${window.to}`,
  );
  if (!stats || stats.kills_sum == null || stats.deaths_sum == null) return null;
  const rounds = stats.rounds_count ?? 0;
  const damage = stats.damage_sum;
  return {
    nick: player.nickname,
    kills: stats.kills_sum,
    deaths: stats.deaths_sum,
    adr: rounds > 0 && damage != null ? damage / rounds : null,
    rating: typeof player.six_month_avg_rating === "number" ? player.six_month_avg_rating : null,
    maps: stats.games_count ?? null,
  };
}

export async function fetchRoster(slug: string, window: { from: string; to: string }): Promise<RosterPlayer[]> {
  const team = await fetchTeam(slug);
  const people = team.players ?? [];
  const active = people.filter((player) => player.is_coach || player.status === 1);
  const roster: RosterPlayer[] = [];
  for (const player of active) {
    const form = player.is_coach ? null : await playerForm(player, window);
    const real = [player.first_name, player.last_name].filter(Boolean).join(" ");
    roster.push({
      id: player.slug,
      nick: player.nickname,
      realName: real || null,
      isCoach: Boolean(player.is_coach),
      url: `https://bo3.gg/players/${player.slug}`,
      kills: form?.kills ?? 0,
      deaths: form?.deaths ?? 0,
      adr: form?.adr ?? null,
      rating: player.is_coach ? null : typeof player.six_month_avg_rating === "number" ? player.six_month_avg_rating : null,
      maps: form?.maps ?? null,
    });
  }
  return roster;
}

export async function fetchSeason(teamId: number): Promise<SideSeries[]> {
  return matchesOf(teamId);
}

export function knownName(id: number): string | undefined {
  return names.get(id);
}

export function opponentSlug(matchSlug: string, ourSlug: string): string | null {
  const parts = matchSlug.split("-vs-");
  if (parts.length < 2) return null;
  const left = parts[0];
  const right = parts.slice(1).join("-vs-").replace(/-\d{2}-\d{2}-\d{4}$/, "");
  if (!left || !right) return null;
  if (left === ourSlug) return right;
  if (right === ourSlug) return left;
  return null;
}

export function applyNames(series: SideSeries[]): SideSeries[] {
  return series.map((item) => ({
    ...item,
    opponentName: names.get(item.opponentId) || item.opponentName,
  }));
}

export function rememberName(id: number, name: string): void {
  names.set(id, name);
}
