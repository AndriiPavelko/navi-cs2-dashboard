import { asArray, isFinished, type RawMatch, type RawOpponent } from "./sync/raw";

export type LengthSample = {
  two: number;
  three: number;
};

export type DistanceBand = {
  low: number;
  high: number;
  reasons: string[];
};

type Scored = {
  bestOf: number | null;
  left: number | null;
  right: number | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function empty(): LengthSample {
  return { two: 0, three: 0 };
}

function scoreNum(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function addLength(sample: LengthSample, row: Scored): void {
  if (row.bestOf !== 3 || row.left == null || row.right == null) return;
  const high = Math.max(row.left, row.right);
  const low = Math.min(row.left, row.right);
  if (high !== 2) return;
  if (low === 0) sample.two += 1;
  else if (low === 1) sample.three += 1;
}

export function lengthFromScores(rows: Scored[], limit = 10): LengthSample {
  const sample = empty();
  let counted = 0;
  for (const row of rows) {
    const before = sample.two + sample.three;
    addLength(sample, row);
    if (sample.two + sample.three === before) continue;
    counted += 1;
    if (counted >= limit) break;
  }
  return sample;
}

export function lengthFromRaw(matches: RawMatch[], limit = 10): LengthSample {
  return lengthFromScores(
    matches.filter(isFinished).map((match) => {
      const opponents = asArray<RawOpponent>(match.match2opponents);
      const best = Number(match.bestof);
      return {
        bestOf: Number.isFinite(best) ? best : null,
        left: scoreNum(opponents[0]?.score),
        right: scoreNum(opponents[1]?.score),
      };
    }),
    limit,
  );
}

export function distanceLean(low: number, high: number): "three" | "two" | "even" {
  if (low >= 55) return "three";
  if (high <= 45) return "two";
  return "even";
}

export function distanceHeadline(low: number, high: number): string {
  const lean = distanceLean(low, high);
  if (lean === "three") return "Частіше серія доходить до третьої карти";
  if (lean === "two") return "Частіше серія закінчується за дві карти";
  return "І дві, і три карти лишаються поруч";
}

function played(sample: LengthSample): number {
  return sample.two + sample.three;
}

export function computeDistanceBand(input: {
  opponent: string;
  label?: string;
  navi: LengthSample;
  opponentForm: LengthSample;
  h2h: LengthSample;
}): DistanceBand | null {
  const label = input.label ?? "NAVI";
  const parts: { rate: number; weight: number }[] = [];
  const reasons: string[] = [];
  const naviN = played(input.navi);
  const oppN = played(input.opponentForm);
  const h2hN = played(input.h2h);

  if (naviN >= 4) {
    parts.push({ rate: input.navi.three / naviN, weight: Math.min(naviN, 10) });
    reasons.push(`Останні BO3 ${label}: ${input.navi.three} з ${naviN} до третьої карти`);
  }
  if (oppN >= 4) {
    parts.push({ rate: input.opponentForm.three / oppN, weight: Math.min(oppN, 10) });
    reasons.push(`Останні BO3 ${input.opponent}: ${input.opponentForm.three} з ${oppN} до третьої карти`);
  }
  if (h2hN >= 3) {
    parts.push({ rate: input.h2h.three / h2hN, weight: Math.min(h2hN, 6) });
    reasons.push(`Особисті BO3 2026: ${input.h2h.three} з ${h2hN} до третьої карти`);
  }
  if (!parts.length) return null;

  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  const point = (parts.reduce((sum, part) => sum + part.rate * part.weight, 0) / weight) * 100;
  const half = naviN < 8 || (oppN > 0 && oppN < 8) ? 8 : 6;
  let low = clamp(Math.round(point - half), 10, 90);
  let high = clamp(Math.round(point + half), 10, 90);
  if (high <= low) high = Math.min(90, low + 1);
  return { low, high, reasons: reasons.slice(0, 3) };
}
