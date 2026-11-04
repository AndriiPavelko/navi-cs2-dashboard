export type Scope = "matches" | "roster" | "posts";
export const INTERVALS: Record<Scope, number> = { matches: 15 * 60_000, roster: 6 * 3600_000, posts: 3600_000 };
export type SourceCheck = { team: string; scope: Scope; attemptedAt: string; succeededAt: string | null; error: string | null; warnings: string[] };

export function isDue(scope: Scope, check: SourceCheck | undefined, now: Date, force = false): boolean {
  if (force || !check) return true;
  // Retry failures on the next tick, but back off for two minutes to avoid hammering the source.
  const interval = check.error ? 2 * 60_000 : INTERVALS[scope];
  return now.getTime() - Date.parse(check.attemptedAt) >= interval;
}

export function isStale(check: SourceCheck, now: number): boolean {
  return !check.succeededAt || now - Date.parse(check.succeededAt) > INTERVALS[check.scope] * 2;
}
