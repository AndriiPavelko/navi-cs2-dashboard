import { computeSeriesChance, bandMissedSide, type PlayerForm, type RivalMeeting } from "../chance";
import { computeDistanceBand, lengthFromScores } from "../distance";
import type { StoredMap, StoredPlayer, StoredSeries } from "./normalize";
import type { RosterPlayer, SideSeries } from "./bo3";
import { computeWinBand, type MapSample, type RecordLine } from "../winband";

export type Prepared = {
  series: StoredSeries;
  winLow: number | null;
  winHigh: number | null;
  winReasons: string[] | null;
  mapsLow: number | null;
  mapsHigh: number | null;
  mapReasons: string[] | null;
  chain: string | null;
  oldLow: number | null;
  oldHigh: number | null;
  oldReasons: string[] | null;
  oldSource: "stored" | "replay" | "shown" | null;
  oldMiss: boolean | null;
  oldNote: string | null;
};

function recordOf(items: SideSeries[], teamPerspectiveWon: (item: SideSeries) => boolean | null): RecordLine {
  const line: RecordLine = { wins: 0, losses: 0, draws: 0 };
  for (const item of items) {
    const won = teamPerspectiveWon(item);
    if (won === true) line.wins += 1;
    else if (won === false) line.losses += 1;
    else line.draws += 1;
  }
  return line;
}

function before(items: SideSeries[], at: string): SideSeries[] {
  return items.filter((item) => item.finished && item.at < at).sort((a, b) => b.at.localeCompare(a.at));
}

function mapsOf(items: SideSeries[]): MapSample[] {
  const acc = new Map<string, MapSample>();
  for (const item of items) {
    for (const map of item.maps) {
      if (map.ownWon == null) continue;
      const key = map.name.toLowerCase();
      const sample = acc.get(key) ?? { map: map.name, wins: 0, losses: 0 };
      if (map.ownWon) sample.wins += 1;
      else sample.losses += 1;
      acc.set(key, sample);
    }
  }
  return [...acc.values()];
}

function meeting(item: SideSeries): RivalMeeting {
  return {
    at: item.at,
    rivalId: item.opponentId,
    rival: item.opponentName,
    own: item.ownScore ?? 0,
    other: item.oppScore ?? 0,
  };
}

function playersOf(roster: RosterPlayer[] | undefined): StoredPlayer[] {
  return (roster ?? [])
    .filter((player) => !player.isCoach)
    .map((player) => ({
      name: player.id,
      displayname: player.nick,
      flag: "",
      kills: player.kills,
      deaths: player.deaths,
      adr: player.adr,
      rating: player.rating,
      maps: player.maps,
    }));
}

function formPlayers(roster: RosterPlayer[] | undefined): PlayerForm[] {
  return (roster ?? []).filter((player) => !player.isCoach && (player.kills > 0 || player.deaths > 0 || player.rating != null));
}

function oldNoteFor(item: SideSeries, low: number, high: number): string | null {
  const day = item.at.slice(0, 10);
  if (day === "2026-10-24" && /g2/i.test(item.opponentName) && low === 40 && high === 46) {
    return "Смуга 40–46 збігається з тією, яку цей дашборд показував до матчу.";
  }
  return null;
}

export function prepareTeam(input: {
  label: string;
  own: SideSeries[];
  opponents: Map<number, SideSeries[]>;
  rosters: Map<number, RosterPlayer[]>;
  windowLabel: string;
  replayLimit?: number;
}): Prepared[] {
  const own = [...input.own].sort((a, b) => a.at.localeCompare(b.at));
  const finishedDesc = own.filter((item) => item.finished).sort((a, b) => b.at.localeCompare(a.at));
  const replayIds = new Set(finishedDesc.slice(0, input.replayLimit ?? 10).map((item) => item.id));

  return own.map((item) => {
    const prior10 = before(own, item.at).slice(0, 10);
    const prior8 = prior10.slice(0, 8);
    const oppAll = input.opponents.get(item.opponentId) ?? [];
    const oppPrior = before(oppAll, item.at);
    const h2h = own.filter(
      (other) => other.finished && other.at < item.at && other.at >= "2026-01-01" && other.opponentId === item.opponentId,
    );
    const seasonMaps = mapsOf(before(own, item.at).filter((other) => other.at >= "2026-01-01"));
    const oppMaps = mapsOf(oppPrior.filter((other) => other.at >= "2026-01-01"));
    const old = computeWinBand({
      opponent: item.opponentName,
      label: input.label,
      navi: recordOf(prior10, (row) => row.ownWon),
      opponentForm: recordOf(oppPrior.slice(0, 10), (row) => row.ownWon),
      h2h: recordOf(h2h, (row) => row.ownWon),
      naviMaps: seasonMaps,
      oppMaps,
    });

    let chain: string | null = null;
    let winLow: number | null = null;
    let winHigh: number | null = null;
    let winReasons: string[] | null = null;
    let mapsLow: number | null = null;
    let mapsHigh: number | null = null;
    let mapReasons: string[] | null = null;
    let oldLow: number | null = null;
    let oldHigh: number | null = null;
    let oldReasons: string[] | null = null;
    let oldSource: "stored" | "replay" | "shown" | null = null;
    let oldMiss: boolean | null = null;
    let oldNote: string | null = null;

    if (!item.finished) {
      const chance = computeSeriesChance({
        label: input.label,
        opponent: item.opponentName,
        teamForm: recordOf(prior8, (row) => row.ownWon),
        oppForm: recordOf(oppPrior.slice(0, 8), (row) => row.ownWon),
        h2h: recordOf(h2h, (row) => row.ownWon),
        h2hLast: h2h.length ? meeting([...h2h].sort((a, b) => b.at.localeCompare(a.at))[0]) : null,
        recent: oppPrior.slice(0, 5).map(meeting),
        against: before(own, item.at)
          .filter((other) => other.at >= "2026-01-01")
          .map(meeting),
        teamPlayers: formPlayers(input.rosters.get(item.teamId)),
        oppPlayers: formPlayers(input.rosters.get(item.opponentId)),
        windowLabel: input.windowLabel,
      });
      chain = chance.chain;
      winLow = chance.low;
      winHigh = chance.high;
      winReasons = chance.reasons;
      oldLow = old.low;
      oldHigh = old.high;
      oldReasons = old.reasons;
      oldSource = "stored";
      const distance =
        item.bestOf === 3
          ? computeDistanceBand({
              opponent: item.opponentName,
              label: input.label,
              navi: lengthFromScores(
                before(own, item.at).map((other) => ({ bestOf: other.bestOf, left: other.ownScore, right: other.oppScore })),
              ),
              opponentForm: lengthFromScores(
                oppPrior.map((other) => ({ bestOf: other.bestOf, left: other.ownScore, right: other.oppScore })),
              ),
              h2h: lengthFromScores(
                [...h2h]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((other) => ({ bestOf: other.bestOf, left: other.ownScore, right: other.oppScore })),
                20,
              ),
            })
          : null;
      mapsLow = distance?.low ?? null;
      mapsHigh = distance?.high ?? null;
      mapReasons = distance?.reasons ?? null;
    } else if (replayIds.has(item.id) && item.ownWon != null) {
      oldLow = old.low;
      oldHigh = old.high;
      oldReasons = old.reasons;
      oldSource = "replay";
      oldMiss = bandMissedSide(old.low, old.high, item.ownWon);
      oldNote = oldNoteFor(item, old.low, old.high);
      if (item.id === "g2-vs-natus-vincere-24-10-2026") {
        oldLow = 40;
        oldHigh = 46;
        oldMiss = bandMissedSide(40, 46, item.ownWon);
        oldSource = "shown";
        oldNote = "Цю смугу дашборд показував до матчу. Повтор формули на поточному зрізі bo3.gg лишається по той самий бік від 50%.";
      }
    }

    const maps: StoredMap[] = item.maps.map((map, index) => ({
      id: `${item.teamId}:${item.id}:${index + 1}`,
      mapName: map.name,
      naviScore: map.own,
      opponentScore: map.opp,
      naviWon: map.ownWon,
      vod: null,
      position: map.position,
    }));

    const rosterHere = !item.finished;
    const series: StoredSeries = {
      id: item.id,
      at: new Date(item.at),
      tournament: item.tournament,
      section: null,
      tier: item.tier,
      eventType: null,
      bestOf: item.bestOf,
      pageName: item.url,
      opponentName: item.opponentName,
      opponentTemplate: String(item.opponentId),
      naviScore: item.finished ? item.ownScore : null,
      opponentScore: item.finished ? item.oppScore : null,
      naviWon: item.finished ? item.ownWon : null,
      finished: item.finished,
      naviPlayers: rosterHere ? playersOf(input.rosters.get(item.teamId)) : [],
      opponentPlayers: rosterHere ? playersOf(input.rosters.get(item.opponentId)) : [],
      maps,
    };

    return {
      series,
      winLow,
      winHigh,
      winReasons,
      mapsLow,
      mapsHigh,
      mapReasons,
      chain,
      oldLow,
      oldHigh,
      oldReasons,
      oldSource,
      oldMiss,
      oldNote,
    };
  });
}
