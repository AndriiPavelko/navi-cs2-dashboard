import assert from "node:assert/strict";
import { pillsFor } from "../lib/format";
import { classifyTone } from "../lib/tone";
import { computeDistanceBand, distanceHeadline, lengthFromRaw } from "../lib/distance";
import { computeWinBand } from "../lib/winband";
import { normalizeMatch } from "../lib/sync/normalize";
import { readKillDeath } from "../lib/sync/raw";
import { parseActiveRoster } from "../lib/sync/roster";
import { parseTelegram } from "../lib/sync/posts";
import { telegramSlug } from "../lib/sync/liquipedia";
import { teamFromPath, teamHref } from "../lib/teams";

const rosterWiki = `
==Player Roster==
{{tabs dynamic
|content1=
===Active===
{{Squad|status=active
|{{Person|flag=ua|id=b1t|name=Valerii Vakhovskyi|joindate=2020-12-20 <ref name="+b1t"/>}}
|{{Person|flag=fi|id=Aleksib|igl=y|name=Aleksi Virolainen|joindate=2023-06-30 <ref name="EU23"/>}}
|{{Person|flag=ua|id=B1ad3|name=Andrii Horodenskyi|role=Coach|joindate=2019-09-20 <ref name="+B1ad3"/>}}
}}
===Former===
{{Person|flag=lt|id=jL|name=Justinas|joindate=2023-06-30}}
|content2=
===Former===
}}
==Organization==
`;

const squad = parseActiveRoster(rosterWiki);
assert.deepEqual(squad.map((person) => person.id), ["b1t", "Aleksib", "B1ad3"]);
assert.equal(squad[1].igl, true);
assert.equal(squad[2].role, "Coach");
assert.equal(squad[0].joinDate, "2020-12-20");

assert.equal(classifyTone("EPL: без права на помилку"), "напружено");
assert.equal(classifyTone("Predator partners with NAVI"), "спокійно");
assert.equal(classifyTone("NAVI проти Vitality у групі"), "зібрано");

const even = computeWinBand({
  opponent: "G2 Esports",
  navi: { wins: 5, losses: 5, draws: 0 },
  opponentForm: { wins: 5, losses: 5, draws: 0 },
  h2h: { wins: 0, losses: 0, draws: 0 },
  naviMaps: [],
  oppMaps: [],
});
assert.equal(even.low, 47);
assert.equal(even.high, 53);
assert.ok(even.reasons.length <= 3);

const hot = computeWinBand({
  opponent: "G2 Esports",
  navi: { wins: 10, losses: 0, draws: 0 },
  opponentForm: { wins: 0, losses: 10, draws: 0 },
  h2h: { wins: 5, losses: 0, draws: 0 },
  naviMaps: [{ map: "Mirage", wins: 10, losses: 0 }],
  oppMaps: [{ map: "Mirage", wins: 0, losses: 10 }],
});
assert.ok(hot.low >= 15 && hot.high <= 85 && hot.high > hot.low);
assert.equal(hot.high, 85);

const distance = computeDistanceBand({
  opponent: "G2 Esports",
  navi: { two: 5, three: 5 },
  opponentForm: { two: 4, three: 5 },
  h2h: { two: 3, three: 2 },
});
assert.ok(distance);
assert.equal(distance.low, 44);
assert.equal(distance.high, 56);
assert.equal(distanceHeadline(distance.low, distance.high), "І дві, і три карти лишаються поруч");

const longSeries = computeDistanceBand({
  opponent: "G2 Esports",
  navi: { two: 1, three: 9 },
  opponentForm: { two: 1, three: 9 },
  h2h: { two: 0, three: 5 },
});
assert.ok(longSeries);
assert.ok(longSeries.low >= 55);
assert.equal(distanceHeadline(longSeries.low, longSeries.high), "Частіше серія доходить до третьої карти");

const g2 = lengthFromRaw([
  { finished: "1", bestof: "3", match2opponents: [{ score: "1" }, { score: "2" }] },
  { finished: "1", bestof: "5", match2opponents: [{ score: "0" }, { score: "3" }] },
  { finished: "1", bestof: "3", match2opponents: [{ score: "2" }, { score: "0" }] },
]);
assert.deepEqual(g2, { two: 1, three: 1 });

assert.deepEqual(readKillDeath({ kills: 18 }), { kills: null, deaths: null });
assert.deepEqual(readKillDeath({ kills: 18, deaths: 14 }), { kills: 18, deaths: 14 });

const match = normalizeMatch({
  match2id: "abc",
  date: "2026-10-07 14:30:00",
  finished: "1",
  winner: "1",
  bestof: "3",
  tournament: "ESL Pro League Season 24",
  section: "Round 5",
  type: "Offline",
  liquipediatier: "1",
  match2opponents: [
    { name: "PARIVISION", score: "2", match2players: [{ displayname: "Jame", name: "Jame" }] },
    {
      name: "Natus Vincere",
      template: "natus vincere 2021",
      score: "1",
      match2players: [{ displayname: "b1t", name: "B1t", extradata: { kills: 16, deaths: 18 } }],
    },
  ],
  match2games: [{ map: "Inferno", winner: "2", scores: [8, 13], match2gameid: 1 }],
});
assert.ok(match);
assert.equal(match?.opponentName, "PARIVISION");
assert.equal(match?.naviScore, 1);
assert.equal(match?.naviWon, false);
assert.equal(match?.maps[0].naviScore, 13);
assert.equal(match?.maps[0].naviWon, true);
assert.equal(match?.naviPlayers[0].kills, 16);
assert.equal(match?.tier, "S-tier");

assert.deepEqual(pillsFor({ bestOf: 3, eventType: "Offline", tier: "S-tier" }), ["BO3", "Офлайн", "S-tier"]);
assert.equal(telegramSlug("https://telegram.me/natus_vincere_official"), "natus_vincere_official");
assert.equal(telegramSlug("https://twitter.com/natusvincere"), null);

const posts = parseTelegram(
  `<div class="tgme_widget_message_wrap"><div data-post="natus_vincere_official/1"><a class="tgme_widget_message_owner_name"><span>Natus Vincere</span></a><div class="tgme_widget_message_text">Готуємось проти G2</div><time datetime="2026-10-22T10:00:00+00:00"></time></div></div>`,
  "natus_vincere_official",
);
assert.equal(posts.length, 1);
assert.equal(posts[0].author, "Natus Vincere");
assert.equal(posts[0].tone, "зібрано");
assert.equal(posts[0].url, "https://t.me/natus_vincere_official/1");

assert.equal(teamFromPath("/faze/matches/abc"), "faze");
assert.equal(teamFromPath("/matches/abc"), "navi");
assert.equal(teamHref("faze", "/players"), "/faze/players");
assert.equal(teamHref("navi", "/pulse"), "/pulse");

console.log("logic tests ok");
