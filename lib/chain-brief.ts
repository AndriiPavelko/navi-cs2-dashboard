export type BriefMeeting = {
  team: string;
  score: string | null;
  date: string | null;
  absent: boolean;
};

export type BriefPlayer = {
  nick: string;
  kd: string;
  adr: string;
  rating: string;
  maps: string;
};

export type BriefLineup = {
  team: string;
  players: BriefPlayer[];
};

export type MatchBrief = {
  recentTeam: string;
  recent: BriefMeeting[];
  sameTeam: string;
  same: BriefMeeting[];
  windowLabel: string;
  lineups: BriefLineup[];
  h2hLeft: string | null;
  h2hScore: string | null;
  h2hRight: string | null;
  h2hDate: string | null;
  h2hPlain: string | null;
};

const PLAYER =
  /^(.+?) ([0-9]+(?:\.[0-9]+)?) K\/D, ADR ([0-9]+), рейтинг bo3 ([0-9]+(?:\.[0-9]+)?), ([0-9]+) карт$/;

function meeting(bit: string): BriefMeeting | null {
  const absent = bit.match(/^(.+?) — у 2026 не грали$/);
  if (absent) return { team: absent[1], score: null, date: null, absent: true };
  const played = bit.match(/^(.+?) (\d+:\d+) проти (.+?) \(([^)]+)\)$/);
  if (!played) return null;
  return { team: played[3], score: played[2], date: played[4], absent: false };
}

function meetings(raw: string, separator: string): BriefMeeting[] | null {
  const bits = raw
    .split(separator)
    .map((bit) => bit.trim())
    .filter(Boolean);
  if (!bits.length) return null;
  const rows: BriefMeeting[] = [];
  for (const bit of bits) {
    const row = meeting(bit);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

function player(bit: string): BriefPlayer | null {
  const match = bit.trim().replace(/\.$/, "").match(PLAYER);
  if (!match) return null;
  return { nick: match[1], kd: match[2], adr: match[3], rating: match[4], maps: match[5] };
}

function lineups(raw: string): BriefLineup[] | null {
  const chunks = raw
    .split(". ")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (!chunks.length) return null;
  const rows: BriefLineup[] = [];
  for (const chunk of chunks) {
    const colon = chunk.indexOf(": ");
    if (colon < 1) return null;
    const team = chunk.slice(0, colon);
    const body = chunk.slice(colon + 2).replace(/\.$/, "");
    const players: BriefPlayer[] = [];
    for (const bit of body.split("; ")) {
      const row = player(bit);
      if (!row) return null;
      players.push(row);
    }
    if (!players.length) return null;
    rows.push({ team, players });
  }
  return rows;
}

/** Turn the stored one-paragraph chain into sections. Returns null if the text is not that shape. */
export function parseMatchBrief(chain: string): MatchBrief | null {
  const text = chain.trim();
  const recentAt = text.indexOf(" останніми грали: ");
  if (recentAt < 1) return null;
  const recentTeam = text.slice(0, recentAt);
  const afterRecent = text.slice(recentAt + " останніми грали: ".length);
  const sameAt = afterRecent.indexOf(" з цими командами: ");
  if (sameAt < 0) return null;
  const beforeSame = afterRecent.slice(0, sameAt);
  const dot = beforeSame.lastIndexOf(". ");
  if (dot < 1) return null;
  const recent = meetings(beforeSame.slice(0, dot), ", ");
  const sameTeam = beforeSame.slice(dot + 2);
  if (!recent || !sameTeam) return null;

  const afterSame = afterRecent.slice(sameAt + " з цими командами: ".length);
  const formAt = afterSame.indexOf(". Форма складів (");
  if (formAt < 1) return null;
  const same = meetings(afterSame.slice(0, formAt), "; ");
  if (!same) return null;

  const afterForm = afterSame.slice(formAt + ". Форма складів (".length);
  const windowEnd = afterForm.indexOf("): ");
  if (windowEnd < 1) return null;
  const windowLabel = afterForm.slice(0, windowEnd);
  const afterWindow = afterForm.slice(windowEnd + "): ".length);

  const h2hMarks = [". Особиста зустріч 2026: ", ". Особисті 2026: ", ". Особистих зустрічей"];
  let h2hAt = -1;
  for (const mark of h2hMarks) {
    const at = afterWindow.lastIndexOf(mark);
    if (at > h2hAt) h2hAt = at;
  }
  if (h2hAt < 1) return null;
  const roster = lineups(afterWindow.slice(0, h2hAt));
  if (!roster) return null;

  let h2h = afterWindow.slice(h2hAt + 2).trim();
  const kast = h2h.indexOf(" KAST ");
  if (kast >= 0) h2h = h2h.slice(0, kast).trim();
  h2h = h2h.replace(/\.$/, "");

  const personal = h2h.match(/^Особиста зустріч 2026: (.+?) (\d+:\d+) проти (.+?) \(([^)]+)\)$/);
  return {
    recentTeam,
    recent,
    sameTeam,
    same,
    windowLabel,
    lineups: roster,
    h2hLeft: personal?.[1] ?? null,
    h2hScore: personal?.[2] ?? null,
    h2hRight: personal?.[3] ?? null,
    h2hDate: personal?.[4] ?? null,
    h2hPlain: personal ? null : h2h.replace(/^Особисті 2026: /, ""),
  };
}
