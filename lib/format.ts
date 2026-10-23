const WEEKDAY: Record<string, string> = {
  Sun: "НД",
  Mon: "ПН",
  Tue: "ВТ",
  Wed: "СР",
  Thu: "ЧТ",
  Fri: "ПТ",
  Sat: "СБ",
};

const MONTHS = ["СІЧ", "ЛЮТ", "БЕР", "КВІ", "ТРА", "ЧЕР", "ЛИП", "СЕР", "ВЕР", "ЖОВ", "ЛИС", "ГРУ"];

const TIERS: Record<string, string> = {
  "1": "S-tier",
  "2": "A-tier",
  "3": "B-tier",
  "4": "C-tier",
  "5": "D-tier",
  "6": "E-tier",
  "7": "F-tier",
  "8": "Misc",
};

export function tierLabel(tier: string | null | undefined, tierType: string | null | undefined): string | null {
  const base = tier ? TIERS[String(tier)] : null;
  const kind = (tierType || "").trim();
  if (base && kind && kind.toLowerCase() !== "general") {
    if (/qual/i.test(kind)) return `${base} · кваліфікація`;
    return base;
  }
  if (base) return base;
  if (/qual/i.test(kind)) return "Кваліфікація";
  return null;
}

export function berlinParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: WEEKDAY[get("weekday")] ?? get("weekday"),
    day: get("day"),
    month: MONTHS[Number(get("month")) - 1] ?? "",
    time: `${get("hour")}:${get("minute")}`,
  };
}

export function dateBadge(iso: string): string {
  const p = berlinParts(iso);
  return `${p.weekday} ${p.day} ${p.month}`;
}

export function berlinClock(iso: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function berlinLong(iso: string): string {
  const text = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return `${text} · Берлін`;
}

export function berlinShort(iso: string): string {
  const p = berlinParts(iso);
  return `${p.day} ${p.month.toLowerCase()} · ${berlinClock(iso)}`;
}

export function eventLabel(tournament: string, section: string | null): string {
  if (section && !tournament.toLowerCase().includes(section.toLowerCase())) {
    return `${tournament} · ${section}`;
  }
  return tournament;
}

export function pillsFor(input: {
  bestOf: number | null;
  eventType: string | null;
  tier: string | null;
}): string[] {
  const items: string[] = [];
  if (input.bestOf && input.bestOf > 0) items.push(`BO${input.bestOf}`);
  if (input.eventType === "Offline") items.push("Офлайн");
  else if (input.eventType === "Online") items.push("Онлайн");
  if (input.tier) items.push(input.tier);
  if (items.length < 3) items.push("CS2");
  return items.slice(0, 3);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} ${one}`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function streakLabel(results: Array<boolean | null>): string {
  const first = results.find((item) => item != null);
  if (first == null) return "—";
  let count = 0;
  for (const item of results) {
    if (item !== first) break;
    count += 1;
  }
  return first
    ? plural(count, "перемога", "перемоги", "перемог")
    : plural(count, "поразка", "поразки", "поразок");
}

export function percent(part: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

const ROLES: Record<string, string> = {
  igl: "Капітан",
  awp: "Снайпер",
  entry: "Відкриваючий",
  support: "Підтримка",
  rifle: "Стрілець",
  lurker: "Луркер",
  coach: "Тренер",
  player: "Гравець",
};

export function roleLabel(role: string | null, isCoach = false): string {
  if (isCoach) return "Тренер";
  return ROLES[role ?? ""] ?? "Гравець";
}

export function joinLabel(day: string | null): string | null {
  if (!day) return null;
  const text = new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
  return `у складі з ${text}`;
}

export function wikiUrl(page: string): string {
  const path = page
    .split("/")
    .map((part) => encodeURIComponent(part.replace(/ /g, "_")))
    .join("/");
  return `https://liquipedia.net/counterstrike/${path}`;
}

export function bandText(low: number, high: number): string {
  return `близько ${low}–${high}%`;
}
