export type Tone = "спокійно" | "зібрано" | "напружено";

const TENSE = [
  "без права",
  "no room",
  "must-win",
  "must win",
  "вирішальн",
  "decider",
  "пораз",
  "програл",
  "програли",
  "програш",
  "defeat",
  "eliminat",
  "виліт",
  "вибув",
  "інцидент",
  "incident",
  "скандал",
  "криз",
  "crisis",
  "дискваліф",
  "забан",
  "штраф",
  "травм",
  "shock",
  "upset",
  "провал",
  "напруж",
  "ризик вильоту",
  "kick",
  "benched",
];

const CALM = [
  "дяку",
  "вітаєм",
  "привіта",
  "з днем",
  "happy birthday",
  "мерч",
  "merch",
  "інтерв",
  "interview",
  "історі",
  "behind the scenes",
  "за лаштунками",
  "партнер",
  "partner",
  "магазин",
  "розіграш",
  "giveaway",
  "контракт",
  "extends",
  "продовж",
  "фото",
  "спогад",
  "підсум",
  "recap",
];

const FOCUSED = [
  "плей-оф",
  "playoff",
  "play-off",
  "готує",
  "готові",
  "ready",
  "bootcamp",
  "тренуван",
  "анонс",
  "preview",
  "розклад",
  "кваліфікац",
  "qualifier",
  "групов",
  "group stage",
  "проти",
  "versus",
];

function hits(text: string, words: string[]): number {
  return words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
}

/** Tone of the post text. Not a judgment about a person. */
export function classifyTone(input: string): Tone {
  const text = input.toLowerCase();
  const tense = hits(text, TENSE);
  const calm = hits(text, CALM);
  const focused = hits(text, FOCUSED) + (/\bvs\b/.test(text) ? 1 : 0);
  if (tense > 0 && tense >= focused && tense >= calm) return "напружено";
  if (focused > calm) return "зібрано";
  if (calm > 0) return "спокійно";
  if (focused > 0) return "зібрано";
  return "спокійно";
}
