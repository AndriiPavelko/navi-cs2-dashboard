export type TeamId = "navi" | "faze";

export type TeamProfile = {
  id: TeamId;
  label: string;
  page: string;
  name: string;
  templatePrefix: string;
  hello: string;
  season: string;
  wiki: string;
};

export const NAVI: TeamProfile = {
  id: "navi",
  label: "NAVI",
  page: "Natus Vincere",
  name: "natus vincere",
  templatePrefix: "natus vincere",
  hello: "Привіт, Andrii",
  season: "Сезон NAVI CS2, 2026",
  wiki: "Natus_Vincere",
};

export const FAZE: TeamProfile = {
  id: "faze",
  label: "FaZe",
  page: "FaZe Clan",
  name: "faze clan",
  templatePrefix: "faze",
  hello: "FaZe Clan",
  season: "Сезон FaZe CS2, 2026",
  wiki: "FaZe_Clan",
};

export const TEAMS: Record<TeamId, TeamProfile> = {
  navi: NAVI,
  faze: FAZE,
};

export const TEAM_LIST = [NAVI, FAZE];

export function isTeamId(value: string): value is TeamId {
  return value === "navi" || value === "faze";
}

export function teamFromPath(path: string): TeamId {
  return path === "/faze" || path.startsWith("/faze/") ? "faze" : "navi";
}

export function sectionOf(path: string): "/" | "/matches" | "/players" | "/pulse" {
  const stripped = path.replace(/^\/faze(?=\/|$)/, "") || "/";
  if (stripped.startsWith("/matches")) return "/matches";
  if (stripped.startsWith("/players")) return "/players";
  if (stripped.startsWith("/pulse")) return "/pulse";
  return "/";
}

export function teamHref(team: TeamId, section: "/" | "/matches" | "/players" | "/pulse" = "/"): string {
  if (team === "navi") return section;
  return section === "/" ? "/faze" : `/faze${section}`;
}

export function matchHref(team: TeamId, id: string): string {
  const encoded = encodeURIComponent(id);
  return team === "faze" ? `/faze/matches/${encoded}` : `/matches/${encoded}`;
}

export function playerHref(team: TeamId, id: string): string {
  const encoded = encodeURIComponent(id);
  return team === "faze" ? `/faze/players/${encoded}` : `/players/${encoded}`;
}
