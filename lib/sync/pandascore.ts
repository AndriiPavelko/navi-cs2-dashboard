import { sourceFetch } from "./http";
import { teamKey, type SecondaryMatch } from "../verification";
import type { TeamProfile } from "../teams";

async function request<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const query = new URLSearchParams({ per_page: "100", ...params });
  const response = await sourceFetch(`https://api.pandascore.co${path}?${query}`, {
    cache: "no-store", headers: { Authorization: `Bearer ${process.env.PANDASCORE_TOKEN}`, Accept: "application/json" },
  });
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("PandaScore: некоректна відповідь");
  return data as T[];
}

export async function fetchSecondaryMatches(team: TeamProfile): Promise<SecondaryMatch[]> {
  const teams = await request<{ id: number; name: string }>("/csgo/teams", { "search[name]": team.id === "navi" ? "Natus Vincere" : "FaZe" });
  const exact = teams.filter((item) => teamKey(item.name) === team.id);
  if (exact.length !== 1) throw new Error(`PandaScore: не вдалося однозначно знайти ${team.label}`);
  const results: SecondaryMatch[] = [];
  for (const kind of ["upcoming", "running", "past"]) {
    // Recent + upcoming results only. Absence never confirms a cancellation.
    results.push(...await request<SecondaryMatch>(`/csgo/matches/${kind}`, { "filter[opponent_id]": String(exact[0].id) }));
  }
  return results;
}
