export type RecordLine = {
  wins: number;
  losses: number;
  draws: number;
};

export type MapSample = {
  map: string;
  wins: number;
  losses: number;
};

export type WinBand = {
  low: number;
  high: number;
  reasons: string[];
};

const DISCLAIMER = "Це оцінка за відкритою статистикою, не порада для ставок.";

export function winDisclaimer(): string {
  return DISCLAIMER;
}

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

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function computeWinBand(input: {
  opponent: string;
  navi: RecordLine;
  opponentForm: RecordLine;
  h2h: RecordLine;
  naviMaps: MapSample[];
  oppMaps: MapSample[];
}): WinBand {
  const naviN = played(input.navi);
  const oppN = played(input.opponentForm);
  let formDelta = 0;
  const reasons: string[] = [];

  if (naviN > 0 && oppN > 0) {
    formDelta = (winRate(input.navi) - winRate(input.opponentForm)) * 18;
    reasons.push(
      `Форма: NAVI ${line(input.navi)} з ${naviN}, ${input.opponent} ${line(input.opponentForm)} з ${oppN}`,
    );
  } else if (naviN > 0 && oppN === 0) {
    reasons.push("Форму суперника у відкритих серіях зараз не видно");
  }

  const h2hN = played(input.h2h);
  let h2hDelta = 0;
  if (h2hN > 0) {
    h2hDelta = ((input.h2h.wins - input.h2h.losses) / h2hN) * 12;
    reasons.push(`Особисті зустрічі 2026: ${line(input.h2h)}`);
  }

  const naviByMap = new Map(input.naviMaps.map((sample) => [sample.map.toLowerCase(), sample]));
  let weight = 0;
  let weighted = 0;
  let naviMapWins = 0;
  let naviMapGames = 0;
  let oppMapWins = 0;
  let oppMapGames = 0;
  for (const opp of input.oppMaps) {
    const navi = naviByMap.get(opp.map.toLowerCase());
    const naviGames = navi ? navi.wins + navi.losses : 0;
    const oppGames = opp.wins + opp.losses;
    if (!navi || naviGames === 0 || oppGames === 0) continue;
    const share = Math.min(naviGames, oppGames);
    weighted += (navi.wins / naviGames - opp.wins / oppGames) * share;
    weight += share;
    naviMapWins += navi.wins;
    naviMapGames += naviGames;
    oppMapWins += opp.wins;
    oppMapGames += oppGames;
  }
  let mapDelta = 0;
  if (weight > 0 && naviMapGames > 0 && oppMapGames > 0) {
    mapDelta = clamp(weighted / weight, -1, 1) * 10;
    const naviPct = pct(naviMapWins / naviMapGames);
    const oppPct = pct(oppMapWins / oppMapGames);
    const gap = naviMapWins / naviMapGames - oppMapWins / oppMapGames;
    if (gap > 0.04) {
      reasons.push(`На спільних картах NAVI ${naviPct}, ${input.opponent} ${oppPct}`);
    } else if (gap < -0.04) {
      reasons.push(`На спільних картах ${input.opponent} ${oppPct}, NAVI ${naviPct}`);
    } else {
      reasons.push(`На спільних картах сили майже рівні: ${naviPct} і ${oppPct}`);
    }
  }

  const point = clamp(50 + formDelta + h2hDelta + mapDelta, 15, 85);
  const half = naviN < 5 || oppN < 5 ? 5 : 3;
  let low = clamp(Math.round(point - half), 15, 85);
  let high = clamp(Math.round(point + half), 15, 85);
  if (high <= low) {
    if (high < 85) high = low + 1;
    else low = high - 1;
  }

  return { low, high, reasons: reasons.slice(0, 3) };
}
