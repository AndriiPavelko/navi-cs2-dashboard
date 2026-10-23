export type SquadPerson = {
  id: string;
  name: string;
  flag: string;
  role: string;
  igl: boolean;
  joinDate: string | null;
};

export const FLAG_COUNTRY: Record<string, string> = {
  ua: "Україна",
  fi: "Фінляндія",
  ro: "Румунія",
  xk: "Косово",
  ru: "Росія",
  kz: "Казахстан",
  pl: "Польща",
  de: "Німеччина",
  fr: "Франція",
  se: "Швеція",
  dk: "Данія",
  no: "Норвегія",
  br: "Бразилія",
  us: "США",
  ca: "Канада",
  au: "Австралія",
  gb: "Велика Британія",
  uk: "Велика Британія",
  ee: "Естонія",
  lv: "Латвія",
  lt: "Литва",
  cz: "Чехія",
  sk: "Словаччина",
  hu: "Угорщина",
  rs: "Сербія",
  ba: "Боснія і Герцеговина",
  hr: "Хорватія",
  si: "Словенія",
  bg: "Болгарія",
  tr: "Туреччина",
  il: "Ізраїль",
  mn: "Монголія",
  cn: "Китай",
  kr: "Південна Корея",
  jp: "Японія",
  es: "Іспанія",
  pt: "Португалія",
  it: "Італія",
  nl: "Нідерланди",
  be: "Бельгія",
  mk: "Північна Македонія",
  by: "Білорусь",
  md: "Молдова",
  ge: "Грузія",
  ar: "Аргентина",
};

function param(body: string, key: string): string {
  const match = body.match(new RegExp(`(?:^|\\|)\\s*${key}=([^|]*)`));
  if (!match) return "";
  return match[1].replace(/<ref[\s\S]*$/i, "").replace(/\{\{abbr\|[^|]*\|/i, "").trim();
}

export function parseActiveRoster(wikitext: string): SquadPerson[] {
  const roster = wikitext.split("==Player Roster==")[1]?.split("==Organization==")[0] ?? "";
  const cs2 = roster.includes("|content1=")
    ? (roster.split("|content1=")[1]?.split("|content2=")[0] ?? roster)
    : roster;
  const activeAt = cs2.search(/===Active===/);
  if (activeAt < 0) return [];
  const rest = cs2.slice(activeAt + "===Active===".length);
  const nextHeading = rest.search(/\n===[A-Za-z]/);
  const active = nextHeading >= 0 ? rest.slice(0, nextHeading) : rest.split("===Former===")[0];
  const people: SquadPerson[] = [];
  const pattern = /\{\{Person\|(.*?)\}\}/gs;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(active))) {
    const body = match[1];
    const id = param(body, "id");
    if (!id) continue;
    const joined = param(body, "joindate").slice(0, 10);
    people.push({
      id,
      name: param(body, "name"),
      flag: param(body, "flag").toLowerCase(),
      role: param(body, "role"),
      igl: /(?:^|\|)igl=y\b/.test(body),
      joinDate: /^\d{4}-\d{2}-\d{2}$/.test(joined) ? joined : null,
    });
  }
  return people;
}

export function telegramSlugsFromWiki(wikitext: string): string[] {
  const found = new Set<string>();
  for (const match of wikitext.matchAll(/\|telegram=([A-Za-z0-9_]{4,64})/g)) {
    found.add(match[1]);
  }
  return [...found];
}

export function normalizeRole(squadRole: string, igl: boolean, lpdbRole: string): string {
  const raw = `${lpdbRole} ${squadRole}`.toLowerCase();
  if (raw.includes("coach") || raw.includes("тренер")) return "coach";
  if (igl || raw.includes("igl")) return "igl";
  if (raw.includes("awp") || raw.includes("sniper")) return "awp";
  if (raw.includes("entry")) return "entry";
  if (raw.includes("support")) return "support";
  if (raw.includes("lurk")) return "lurker";
  if (raw.includes("rifle")) return "rifle";
  return "player";
}

export function lpdbRoleOf(extradata: unknown): string {
  if (!extradata || typeof extradata !== "object" || Array.isArray(extradata)) return "";
  const record = extradata as Record<string, unknown>;
  if (typeof record.role === "string") return record.role;
  if (Array.isArray(record.roles) && typeof record.roles[0] === "string") return record.roles[0];
  return "";
}
