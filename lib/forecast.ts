import { computeWinBand, type RecordLine, type WinBand } from "./winband";
import { mapsFromSeries, matchDate, normalizeMatch, type StoredSeries } from "./sync/normalize";
import { asArray, sameSide, type RawMatch, type RawOpponent } from "./sync/raw";
import { TEAM_LIST, type TeamProfile } from "./teams";

const DAY = 86400000;
export const FORECAST_VERSION = "form-90d-v2";

export function forecast(item: StoredSeries, series: StoredSeries[], rawHistory: RawMatch[], label: string, asOf: Date): WinBand | null {
  const cutoff = Math.min(asOf.getTime(), item.at.getTime());
  const since = cutoff - 90 * DAY;
  const side = { name: item.opponentName, template: item.opponentTemplate ?? "" };
  const prior = series.filter((row) => row.finished && row.resultKind === "played" && row.naviWon != null &&
    row.at.getTime() < cutoff && row.at.getTime() >= since).sort((a, b) => b.at.getTime() - a.at.getTime());
  const history = rawHistory.filter((row) => {
    const at = matchDate(row.date)?.getTime();
    return at != null && at < cutoff && at >= since && asArray<RawOpponent>(row.match2opponents).some((opponent) => sameSide(opponent, side));
  }).sort((a, b) => matchDate(b.date)!.getTime() - matchDate(a.date)!.getTime());
  const line = (rows: StoredSeries[]): RecordLine => ({
    wins: rows.filter((row) => row.naviWon === true).length,
    losses: rows.filter((row) => row.naviWon === false).length, draws: 0,
  });
  // Opponent history uses the same exclusion rules as the tracked team's history.
  const oppTeam: TeamProfile = { ...TEAM_LIST[0], name: item.opponentName.toLowerCase(), templatePrefix: side.template.toLowerCase() };
  const opponents = history.map((row) => normalizeMatch(row, oppTeam)).filter((row): row is StoredSeries =>
    Boolean(row?.finished && row.resultKind === "played" && row.naviWon != null)).slice(0, 10);
  let sample = prior.slice(0, 10);
  // Stop at the first known lineup change. Never pool multiple rosters as one form sample.
  const currentNames = new Set(item.naviPlayers.map((p) => p.name.toLowerCase()).filter(Boolean));
  if (currentNames.size >= 5) {
    const changedAt = sample.findIndex((row) => row.naviPlayers.length >= 5 &&
      row.naviPlayers.filter((p) => currentNames.has(p.name.toLowerCase())).length < 5);
    if (changedAt >= 0) sample = sample.slice(0,changedAt);
  }
  return computeWinBand({
    opponent: item.opponentName, label, navi: line(sample), opponentForm: line(opponents),
    h2h: line(prior.filter((row) => row.opponentName.toLowerCase() === item.opponentName.toLowerCase())),
    naviMaps: mapsFromSeries(sample), oppMaps: mapsFromSeries(opponents),
  });
}

export function backtest(raw: RawMatch[], team: TeamProfile, now = new Date()) {
  const series = raw.map((row) => normalizeMatch(row, team, now)).filter((row): row is StoredSeries => Boolean(row))
    .filter((row) => row.at < now).sort((a, b) => a.at.getTime() - b.at.getTime());
  const rows: Array<{ id: string; at: string; probability: number; outcome: number }> = [];
  for (const item of series) {
    if (!item.finished || item.resultKind !== "played" || item.naviWon == null) continue;
    // No finish timestamps are available: use a conservative 24h embargo to avoid same-day leakage.
    const asOf = new Date(item.at.getTime() - DAY);
    const prediction = forecast({ ...item, naviPlayers: [] }, series, raw, team.label, asOf);
    if (prediction) rows.push({ id: item.id, at: item.at.toISOString(), probability: (prediction.low + prediction.high) / 200, outcome: Number(item.naviWon) });
  }
  return {
    version: FORECAST_VERSION, team: team.id, tested: rows.length, eligible: series.filter((r) => r.resultKind === "played").length,
    brier: rows.length ? rows.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / rows.length : null,
    baselineBrier: rows.length ? 0.25 : null,
    calibration: [0, 0.2, 0.4, 0.6, 0.8].map((low) => {
      const bin = rows.filter((r) => r.probability >= low && r.probability < low + 0.2);
      return { low, high: low + 0.2, count: bin.length, predicted: bin.length ? bin.reduce((s, r) => s + r.probability, 0) / bin.length : null,
        observed: bin.length ? bin.reduce((s, r) => s + r.outcome, 0) / bin.length : null };
    }),
    note: "Ретроспективний тест з виправленими даними джерела; не підтверджує точність у реальному часі. Сила суперників і veto ще не моделюються.", rows,
  };
}
