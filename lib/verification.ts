import type { StoredSeries } from "./sync/normalize";
import type { TeamProfile } from "./teams";
import { matchSource } from "./sources";

export type Evidence = { name: string; url: string; checkedAt: string };
export type Verification = {
  state: "single_source" | "corroborated" | "conflict";
  details: string[];
  sources: Evidence[];
};

export type SecondaryMatch = {
  id: number;
  begin_at: string | null;
  scheduled_at: string | null;
  status: string;
  number_of_games: number;
  draw: boolean;
  forfeit: boolean;
  opponents: Array<{ opponent: { id: number; name: string } }>;
  results: Array<{ team_id: number; score: number }>;
  tournament?: { name: string };
  league?: { name: string; url?: string | null };
};

export function teamKey(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["navi", "natusvincere"].includes(key)) return "navi";
  if (["faze", "fazeclan"].includes(key)) return "faze";
  const aliases: Record<string,string> = { g2esports:"g2",teamvitality:"vitality",teamspirit:"spirit",teamliquid:"liquid",teamfalcons:"falcons",mousesports:"mouz" };
  if (aliases[key]) return aliases[key];
  return key;
}

export function verifyMatch(item: StoredSeries, team: TeamProfile, matches: SecondaryMatch[], checkedAt: string): Verification {
  const result: Verification = {
    state: item.dataIssues.length ? "conflict" : "single_source", details: [...item.dataIssues],
    sources: [{ ...matchSource(item.pageName,team.page), checkedAt }],
  };
  const candidates = matches.filter((other) => {
    const names = other.opponents.map(({ opponent }) => teamKey(opponent.name));
    const date = other.begin_at || other.scheduled_at;
    return names.length === 2 && names.includes(team.id) && names.includes(teamKey(item.opponentName)) &&
      date && Math.abs(Date.parse(date) - item.at.getTime()) <= 36 * 3600000;
  });
  // Ambiguous rematches cannot be matched just by team names and time.
  if (candidates.length !== 1) {
    result.details.push(candidates.length ? "Неоднозначна відповідність у другому джерелі" : "Другого підтвердження немає");
    return result;
  }
  const other = candidates[0];
  result.sources.push({ name: "PandaScore", url: `https://api.pandascore.co/csgo/matches/${other.id}`, checkedAt });
  const at = Date.parse(other.begin_at || other.scheduled_at || "");
  if (Math.abs(at - item.at.getTime()) > 5 * 60000) result.details.push("Час початку відрізняється більш ніж на 5 хвилин");
  const status = other.status === "not_started" ? "scheduled" : other.status === "canceled" ? "cancelled" : other.status;
  if (status !== item.status) result.details.push("Джерела вказують різні статуси матчу");
  if (item.bestOf != null && other.number_of_games && item.bestOf !== other.number_of_games) result.details.push("Відрізняється формат серії");
  let complete = true;
  if (item.finished && status === "finished") {
    const own = other.opponents.find(({ opponent }) => teamKey(opponent.name) === team.id)?.opponent;
    const opp = other.opponents.find(({ opponent }) => teamKey(opponent.name) !== team.id)?.opponent;
    const left = other.results.find((row) => row.team_id === own?.id)?.score;
    const right = other.results.find((row) => row.team_id === opp?.id)?.score;
    complete = left != null && right != null && item.naviScore != null && item.opponentScore != null;
    if (complete && (left !== item.naviScore || right !== item.opponentScore)) result.details.push("Рахунок серії не збігається");
    if (typeof other.forfeit === "boolean" && other.forfeit !== (item.resultKind === "walkover")) result.details.push("Відрізняється позначка технічного результату");
  }
  result.state = result.details.length ? "conflict" : complete ? "corroborated" : "single_source";
  if (!complete) result.details.push("Другому джерелу бракує повного рахунку");
  return result;
}

export function verificationLabel(state: Verification["state"]): string {
  return state === "corroborated" ? "Збігається у двох джерелах" : state === "conflict" ? "Джерела розходяться" : "Одне джерело";
}
