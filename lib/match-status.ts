export type MatchStatus = "scheduled" | "running" | "finished" | "cancelled" | "postponed" | "unknown";
export type ResultKind = "played" | "draw" | "walkover" | "unknown";

export function statusLabel(status: MatchStatus, kind: ResultKind = "unknown"): string {
  if (status === "cancelled") return "Скасовано";
  if (status === "postponed") return "Перенесено";
  if (status === "running") return "Матч триває";
  if (status === "scheduled") return "Заплановано";
  if (kind === "walkover") return "Технічний результат";
  if (kind === "draw") return "Нічия";
  return status === "finished" ? "Завершено · результат уточнюється" : "Статус уточнюється";
}

export function isUpcoming(item: { status: MatchStatus; sourceMissing?: boolean; at?: string }, now = Date.now()): boolean {
  return !item.sourceMissing && (item.status === "running" || (item.status === "scheduled" &&
    (!item.at || Date.parse(item.at) >= now - 6 * 3600000)));
}
