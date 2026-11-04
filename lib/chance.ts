import { dateBadge } from "./format";
import type { RecordLine } from "./winband";

export const MISSING_FIELDS =
  "KAST bo3.gg на гравця не віддає. HLTV Rating не вигадуємо: цифра «рейтинг bo3» — це їхній six_month_avg_rating. ADR рахуємо як шкоду на раунд із damage_sum і rounds_count.";

export type PlayerForm = {
  nick: string;
  kills: number;
  deaths: number;
  adr: number | null;
  rating: number | null;
  maps: number | null;
};

export type RivalMeeting = {
  at: string;
  rivalId: number;
  rival: string;
  own: number;
  other: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function played(record: RecordLine): number {
  return record.wins + record.losses + record.draws;
}

function winRate(record: RecordLine): number {
  const games = played(record);
  return games ? record.wins / games : 0;
}

function line(record: RecordLine): string {
  const base = `${record.wins}–${record.losses}`;
  return record.draws ? `${base}–${record.draws}` : base;
}

export function kdRatio(kills: number, deaths: number): number | null {
  if (deaths <= 0) return kills > 0 ? kills : null;
  return kills / deaths;
}

export function rosterKd(players: PlayerForm[]): number | null {
  let kills = 0;
  let deaths = 0;
  for (const player of players) {
    kills += player.kills;
    deaths += player.deaths;
  }
  return kdRatio(kills, deaths);
}

export function rosterRating(players: PlayerForm[]): number | null {
  const rated = players.filter((player) => player.rating != null);
  if (!rated.length) return null;
  const sum = rated.reduce((total, player) => total + (player.rating ?? 0), 0);
  return sum / rated.length;
}

export function bandPickedSide(low: number, high: number): "team" | "opponent" | "none" {
  if (low > 50) return "team";
  if (high < 50) return "opponent";
  return "none";
}

/** True when the band named a side and that side lost. Null when the band did not name a side. */
export function bandMissedSide(low: number, high: number, teamWon: boolean): boolean | null {
  const side = bandPickedSide(low, high);
  if (side === "none") return null;
  if (side === "team") return !teamWon;
  return teamWon;
}

function fmtKd(value: number | null): string {
  return value == null ? "—" : value.toFixed(2);
}

function playerBit(player: PlayerForm): string {
  const kd = fmtKd(kdRatio(player.kills, player.deaths));
  const adr = player.adr == null ? "" : `, ADR ${Math.round(player.adr)}`;
  const rating = player.rating == null ? "" : `, рейтинг bo3 ${player.rating.toFixed(2)}`;
  const maps = player.maps == null ? "" : `, ${player.maps} карт`;
  return `${player.nick} ${kd} K/D${adr}${rating}${maps}`;
}

function latestByRival(meetings: RivalMeeting[]): Map<number, RivalMeeting> {
  const map = new Map<number, RivalMeeting>();
  const sorted = [...meetings].sort((a, b) => b.at.localeCompare(a.at));
  for (const meeting of sorted) {
    if (!map.has(meeting.rivalId)) map.set(meeting.rivalId, meeting);
  }
  return map;
}

export function computeSeriesChance(input: {
  label: string;
  opponent: string;
  teamForm: RecordLine;
  oppForm: RecordLine;
  h2h: RecordLine;
  h2hLast: RivalMeeting | null;
  recent: RivalMeeting[];
  against: RivalMeeting[];
  teamPlayers: PlayerForm[];
  oppPlayers: PlayerForm[];
  windowLabel: string;
}): { low: number; high: number; reasons: string[]; chain: string } {
  const reasons: string[] = [];
  const teamN = played(input.teamForm);
  const oppN = played(input.oppForm);
  let formDelta = 0;
  if (teamN > 0 && oppN > 0) {
    formDelta = (winRate(input.teamForm) - winRate(input.oppForm)) * 14;
    reasons.push(
      `Форма: ${input.label} ${line(input.teamForm)} з ${teamN}, ${input.opponent} ${line(input.oppForm)} з ${oppN}`,
    );
  }

  const h2hN = played(input.h2h);
  let h2hDelta = 0;
  if (h2hN > 0) {
    h2hDelta = ((input.h2h.wins - input.h2h.losses) / h2hN) * 10;
    reasons.push(`Особисті зустрічі 2026: ${line(input.h2h)}`);
  }

  const recent = input.recent.slice(0, 5);
  const ours = latestByRival(input.against);
  const seen = new Set<number>();
  const diffs: number[] = [];
  for (const meeting of recent) {
    if (seen.has(meeting.rivalId)) continue;
    seen.add(meeting.rivalId);
    const our = ours.get(meeting.rivalId);
    if (!our) continue;
    const ourWin = our.own > our.other ? 1 : our.own < our.other ? 0 : 0.5;
    const theirWin = meeting.own > meeting.other ? 1 : meeting.own < meeting.other ? 0 : 0.5;
    diffs.push(ourWin - theirWin);
  }
  const commonDelta = diffs.length ? (diffs.reduce((sum, item) => sum + item, 0) / diffs.length) * 12 : 0;
  if (recent.length) {
    reasons.push(
      diffs.length
        ? `Спільні суперники з останніх матчів ${input.opponent}: ${diffs.length}`
        : `З останніх суперників ${input.opponent} спільних із ${input.label} у 2026 немає`,
    );
  }

  const teamKd = rosterKd(input.teamPlayers);
  const oppKd = rosterKd(input.oppPlayers);
  let kdDelta = 0;
  if (teamKd != null && oppKd != null) {
    kdDelta = clamp((teamKd - oppKd) * 8, -8, 8);
    reasons.push(`K/D складів: ${input.label} ${fmtKd(teamKd)}, ${input.opponent} ${fmtKd(oppKd)}`);
  }
  const teamRating = rosterRating(input.teamPlayers);
  const oppRating = rosterRating(input.oppPlayers);
  let ratingDelta = 0;
  if (teamRating != null && oppRating != null) {
    ratingDelta = clamp((teamRating - oppRating) * 4, -6, 6);
  }

  const point = clamp(50 + formDelta + h2hDelta + commonDelta + kdDelta + ratingDelta, 12, 88);
  const half = diffs.length >= 2 && teamKd != null && oppKd != null ? 4 : 6;
  let low = clamp(Math.round(point - half), 12, 88);
  let high = clamp(Math.round(point + half), 12, 88);
  if (high <= low) high = Math.min(88, low + 1);

  const recentText = recent
    .map((meeting) => `${input.opponent} ${meeting.own}:${meeting.other} проти ${meeting.rival} (${dateBadge(meeting.at)})`)
    .join(", ");
  const ourBits: string[] = [];
  const listed = new Set<number>();
  for (const meeting of recent) {
    if (listed.has(meeting.rivalId)) continue;
    listed.add(meeting.rivalId);
    const our = ours.get(meeting.rivalId);
    ourBits.push(
      our
        ? `${input.label} ${our.own}:${our.other} проти ${meeting.rival} (${dateBadge(our.at)})`
        : `${meeting.rival} — у 2026 не грали`,
    );
  }
  const h2hText = input.h2hLast
    ? `Особиста зустріч 2026: ${input.label} ${input.h2hLast.own}:${input.h2hLast.other} проти ${input.opponent} (${dateBadge(input.h2hLast.at)}).`
    : h2hN > 0
      ? `Особисті 2026: ${input.label} ${line(input.h2h)}.`
      : `Особистих зустрічей у 2026 до цієї серії немає.`;
  const playersText = [
    input.teamPlayers.length ? `${input.label}: ${input.teamPlayers.map(playerBit).join("; ")}.` : "",
    input.oppPlayers.length ? `${input.opponent}: ${input.oppPlayers.map(playerBit).join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const chain = [
    recentText ? `${input.opponent} останніми грали: ${recentText}.` : "",
    ourBits.length ? `${input.label} з цими командами: ${ourBits.join("; ")}.` : "",
    playersText ? `Форма складів (${input.windowLabel}): ${playersText}` : "",
    h2hText,
    MISSING_FIELDS,
  ]
    .filter(Boolean)
    .join(" ");

  return { low, high, reasons: reasons.slice(0, 4), chain };
}
