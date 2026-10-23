import { percent, streakLabel } from "./format";
import type { PersonInMatch, PlayerVM, SeasonStats, SeriesVM } from "./types";

export function seasonStats(series: SeriesVM[]): SeasonStats {
  const finished = series
    .filter((item) => item.finished)
    .sort((a, b) => b.at.localeCompare(a.at));
  const wins = finished.filter((item) => item.naviWon === true).length;
  const losses = finished.filter((item) => item.naviWon === false).length;
  const draws = finished.length - wins - losses;
  let mapWins = 0;
  let mapLosses = 0;
  for (const item of finished) {
    for (const map of item.maps) {
      if (map.naviWon === true) mapWins += 1;
      else if (map.naviWon === false) mapLosses += 1;
    }
  }
  const decided = wins + losses;
  return {
    series: finished.length,
    wins,
    losses,
    draws,
    winRate: percent(wins, decided),
    mapWins,
    mapLosses,
    streak: streakLabel(finished.map((item) => item.naviWon)),
  };
}

export function playedIn(player: Pick<PlayerVM, "id" | "nickname">, series: SeriesVM): boolean {
  const keys = new Set([player.id.toLowerCase(), player.nickname.toLowerCase()]);
  return series.naviPlayers.some(
    (person) => keys.has(person.displayname.toLowerCase()) || keys.has(person.name.toLowerCase()),
  );
}

export function findPerson(
  player: Pick<PlayerVM, "id" | "nickname">,
  people: PersonInMatch[],
): PersonInMatch | undefined {
  const keys = new Set([player.id.toLowerCase(), player.nickname.toLowerCase()]);
  return people.find(
    (person) => keys.has(person.displayname.toLowerCase()) || keys.has(person.name.toLowerCase()),
  );
}

export function killDeath(player: Pick<PlayerVM, "id" | "nickname">, series: SeriesVM[]): {
  kills: number;
  deaths: number;
  samples: number;
} {
  let kills = 0;
  let deaths = 0;
  let samples = 0;
  for (const item of series) {
    const person = findPerson(player, item.naviPlayers);
    if (!person || person.kills == null || person.deaths == null) continue;
    kills += person.kills;
    deaths += person.deaths;
    samples += 1;
  }
  return { kills, deaths, samples };
}
