import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { PoolClient } from "pg";
import { ensureSchema } from "../lib/db";
import { normalizeMatch, recordFromRaw, matchDate } from "../lib/sync/normalize";
import { isTrackedSide, type RawMatch } from "../lib/sync/raw";
import { NAVI, FAZE } from "../lib/teams";
import { runSync, writeMatches, writeRoster, writePosts, type PlayerRow } from "../lib/sync/run";
import { verifyMatch, type SecondaryMatch } from "../lib/verification";
import { isDue, isStale } from "../lib/sync/schedule";
import { isUpcoming } from "../lib/match-status";
import { selectFacts, updateDigest } from "../lib/sync/summary";
import { computeWinBand } from "../lib/winband";
import { forecast, backtest } from "../lib/forecast";
import { deduplicatePosts, parseFazeNews, relevantPost, type PostDraft } from "../lib/sync/posts";
import type { Prepared } from "../lib/sync/prepare";

const at = "2026-11-04T09:00:00Z";
const raw: RawMatch = { match2id:"final",date:"2026-11-03 10:00:00",finished:"1",winner:"1",bestof:"3",
  tournament:"Test Cup",match2opponents:[{name:"Natus Vincere",score:2},{name:"FaZe Clan",score:1}],
  match2games:[{map:"Inferno",match2gameid:1,winner:1,scores:[13,9]}] };
const match = normalizeMatch(raw)!;
assert.equal(match.resultKind,"played");
const impossible = normalizeMatch({...raw,date:"2026-11-09 10:00:00"},NAVI,new Date(at))!;
assert.equal(impossible.status,"unknown");
assert.equal(impossible.naviScore,null);
assert.equal(impossible.maps[0].naviScore,null);
assert.equal(normalizeMatch({...raw,winner:"",match2opponents:[{name:"Natus Vincere"},{name:"FaZe Clan"}]})?.resultKind,"unknown");
assert.equal(normalizeMatch({...raw,status:"cancelled"})?.finished,false);
assert.equal(normalizeMatch({...raw,status:"postponed"})?.status,"postponed");
assert.equal(normalizeMatch({...raw,walkover:true})?.resultKind,"walkover");
assert.equal(normalizeMatch({...raw,finished:"0",winner:"",match2games:[{map:"Inferno",scores:[5,3]}]})?.maps[0].naviWon,null);
assert.equal(matchDate("2026-11-03T10:00:00Z")?.toISOString(),"2026-11-03T10:00:00.000Z");
assert.equal(matchDate("2026-11-03T11:00:00+01:00")?.toISOString(),"2026-11-03T10:00:00.000Z");
assert.equal(isTrackedSide({name:"Natus Vincere Junior",template:"natus vincere junior"},NAVI.name,NAVI.templatePrefix),false);
assert.deepEqual(recordFromRaw([{...raw,winner:"",match2opponents:[{name:"Natus Vincere"},{name:"FaZe Clan"}]}],{name:"Natus Vincere",template:""}),{wins:0,losses:0,draws:0});
assert.equal(recordFromRaw([{...raw,winner:""}],{name:"Natus Vincere",template:""}).wins,1);
assert.equal(isUpcoming({status:"cancelled"}),false);
assert.equal(isUpcoming({status:"scheduled",sourceMissing:true}),false);
assert.equal(isUpcoming({status:"scheduled",at:"2026-11-01T10:00:00Z"},Date.parse(at)),false);

const secondary: SecondaryMatch = {id:1,begin_at:"2026-11-03T10:00:00Z",scheduled_at:null,status:"finished",number_of_games:3,draw:false,forfeit:false,
  opponents:[{opponent:{id:2,name:"FaZe"}},{opponent:{id:1,name:"NAVI"}}],results:[{team_id:1,score:2},{team_id:2,score:1}]};
assert.equal(verifyMatch(match,NAVI,[secondary],at).state,"corroborated");
assert.equal(verifyMatch(match,NAVI,[{...secondary,results:[{team_id:1,score:0},{team_id:2,score:2}]}],at).state,"conflict");
assert.equal(verifyMatch(match,NAVI,[secondary,secondary],at).state,"single_source");
assert.equal(verifyMatch(match,NAVI,[{...secondary,results:[]}],at).state,"single_source");

const check = {team:"navi",scope:"matches" as const,attemptedAt:at,succeededAt:at,error:null,warnings:[]};
assert.equal(isDue("matches",check,new Date(Date.parse(at)+14*60000)),false);
assert.equal(isDue("matches",check,new Date(Date.parse(at)+15*60000)),true);
assert.equal(isDue("matches",{...check,error:"timeout"},new Date(Date.parse(at)+2*60000)),true);
assert.equal(isStale(check,Date.parse(at)+31*60000),true);

assert.equal(computeWinBand({opponent:"FaZe",navi:{wins:2,losses:1,draws:0},opponentForm:{wins:5,losses:5,draws:0},h2h:{wins:0,losses:0,draws:0},naviMaps:[],oppMaps:[]}),null);
// Appending matches after the forecast cutoff must never change its prediction.
const history: RawMatch[] = [];
for(let index=0;index<8;index++) {
  const date = `2026-10-${String(index+1).padStart(2,"0")} 10:00:00`;
  history.push({...raw,match2id:`n-${index}`,date,match2opponents:[{name:"Natus Vincere",score:2},{name:"Other",score:0}]});
  history.push({...raw,match2id:`f-${index}`,date,winner:index%2 ? "1":"2",match2opponents:[{name:"FaZe Clan",score:index%2 ? 2:0},{name:"Other",score:index%2 ? 0:2}]});
}
const prior = history.map((row) => normalizeMatch(row)).filter((row) => row != null);
const target = {...match,finished:false,status:"scheduled" as const};
const baseline = forecast(target,prior,history,"NAVI",new Date(at));
assert.ok(baseline);
const future = {...raw,match2id:"future",date:"2026-11-05 10:00:00",winner:"2"};
assert.deepEqual(forecast(target,[...prior,normalizeMatch(future)!],[...history,future],"NAVI",new Date(at)),baseline);
const report = backtest([...history,raw],NAVI,new Date(at));
assert.ok(report.rows.some((row) => row.id === "final"));
assert.ok(!report.rows.some((row) => row.id === "n-0"),"matches without sufficient prior history must be skipped");

const facts = [{id:"one",text:"NAVI 2:1 FaZe",sources:[]}];
assert.equal(selectFacts({factIds:["one"]},facts)[0].text,"NAVI 2:1 FaZe");
assert.throws(() => selectFacts({factIds:["invented"]},facts));
assert.throws(() => selectFacts({factIds:["one","one"]},facts));
assert.equal(relevantPost({title:"New hoodie",body:"Shop now"}),false);
assert.equal(relevantPost({title:"CS2 roster",body:"Update"}),true);
assert.equal(parseFazeNews('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>').length,0);
assert.throws(() => parseFazeNews("<html>not a feed</html>"));
assert.equal(deduplicatePosts([{url:"one",title:"same",body:"a"},{url:"one",title:"same",body:"a"}]).length,1);

async function databaseTests() {
  const db = new PGlite();
  const client = { query: async (sql:string,params?:unknown[]) => params?.length ? db.query(sql,params) : (await db.exec(sql)).at(-1) } as unknown as PoolClient;
  try {
    await ensureSchema(client);
    await ensureSchema(client); // migrations must also work on an existing database
    const warnings: string[] = [];
    const bundle = {matches:[raw],forms:{},wiki:""};
    await writeMatches(client,NAVI,[match],bundle,[],at,warnings);
    const upcoming = normalizeMatch({...raw,match2id:"upcoming",finished:"0",winner:"",date:"2026-11-10 10:00:00"})!;
    await writeMatches(client,NAVI,[match,upcoming],bundle,[],at,warnings);
    await writeMatches(client,NAVI,[match],bundle,[],at,warnings);
    assert.equal((await db.query<{source_missing:boolean}>("SELECT source_missing FROM series WHERE id='upcoming'")).rows[0].source_missing,true);
    assert.equal((await db.query("SELECT * FROM series")).rows.length,2);
    await writeMatches(client,NAVI,[{...match,maps:[]}],bundle,[],at,warnings);
    assert.equal((await db.query("SELECT * FROM maps WHERE series_id='final'")).rows.length,1,"partial map responses must not erase scores");
    await writeMatches(client,NAVI,[{...match,finished:false,status:"scheduled",resultKind:"unknown",naviScore:null,opponentScore:null}],bundle,[],at,warnings);
    assert.equal((await db.query<{navi_score:number}>("SELECT navi_score FROM series WHERE id='final'")).rows[0].navi_score,2);
    assert.ok(warnings.some((w) => w.includes("Збережено")));
    await writeMatches(client,NAVI,[{...match,naviScore:null,opponentScore:null}],bundle,[],at,warnings);
    assert.equal((await db.query<{navi_score:number}>("SELECT navi_score FROM series WHERE id='final'")).rows[0].navi_score,2);
    // Both perspectives of the same real match and the same post must survive.
    await writeMatches(client,FAZE,[normalizeMatch(raw,FAZE)!],bundle,[],at,[]);
    assert.equal((await db.query("SELECT * FROM maps WHERE series_id='final'")).rows.length,2);
    const bo3Series={...upcoming,id:"bo3-fixture",pageName:"https://bo3.gg/matches/bo3-fixture",maps:[],naviPlayers:[{name:"player",displayname:"player",flag:"",kills:100,deaths:80}]};
    const bo3Prepared:Prepared={series:bo3Series,winLow:55,winHigh:61,winReasons:["fixture form"],mapsLow:40,mapsHigh:50,
      mapReasons:["fixture maps"],chain:"fixture brief",oldLow:55,oldHigh:61,oldReasons:["stored"],oldSource:"stored",oldMiss:null,oldNote:null};
    await writeMatches(client,NAVI,[bo3Series],bundle,[],at,[],[bo3Prepared]);
    const savedBo3=(await db.query<{chain:string;maps_low:number;verification:{sources:Array<{name:string;url:string}>}}>("SELECT * FROM series WHERE id='bo3-fixture'")).rows[0];
    assert.equal(savedBo3.chain,"fixture brief");
    assert.equal(savedBo3.maps_low,40);
    assert.equal(savedBo3.verification.sources[0].name,"bo3.gg");
    assert.equal(savedBo3.verification.sources[0].url,bo3Series.pageName);
    await writeMatches(client,NAVI,[match],bundle,[],at,[]);
    assert.equal((await db.query<{source_missing:boolean}>("SELECT source_missing FROM series WHERE id='bo3-fixture'")).rows[0].source_missing,false,"a missing LP record must not mark a bo3 record missing");
    const completed={...bo3Series,finished:true,status:"finished" as const,resultKind:"played" as const,naviScore:2,opponentScore:0,naviWon:true,naviPlayers:[]};
    await writeMatches(client,NAVI,[completed],bundle,[],at,[],[{...bo3Prepared,series:completed,oldLow:40,oldHigh:46,oldSource:"replay"}]);
    assert.equal((await db.query<{old_low:number;old_source:string}>("SELECT old_low,old_source FROM series WHERE id='bo3-fixture'")).rows[0].old_low,55,"pre-match stored bands must survive retrospective recalculation");
    assert.deepEqual((await db.query<{navi_players:unknown[]}>("SELECT navi_players FROM series WHERE id='bo3-fixture'")).rows[0].navi_players,[],"90-day pre-match stats must not become individual match stats");
    const post: PostDraft = {id:"tg:one/1",source:"telegram",author:"Club",title:"CS2",body:"Final",url:"https://t.me/one/1",publishedAt:at,tone:"зібрано"};
    await writePosts(client,"navi",[post]); await writePosts(client,"faze",[post]);
    assert.equal((await db.query("SELECT * FROM posts")).rows.length,2);
    const roster: PlayerRow[] = Array.from({length:5},(_,i) => ({id:`p${i}`,nickname:`p${i}`,realName:null,country:null,role:"player",isCoach:false,joinDate:null,sortOrder:i,url:"https://liquipedia.net"}));
    await writeRoster(client,"navi",roster);
    await assert.rejects(() => writeRoster(client,"navi",roster.slice(0,3)));
    assert.equal((await db.query("SELECT * FROM players WHERE active=TRUE")).rows.length,5);
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try { await updateDigest(client,NAVI); } finally { if (savedKey) process.env.OPENAI_API_KEY=savedKey; }
    const digest = (await db.query<{payload:{mode:string;items:unknown[]}}>("SELECT payload FROM digests WHERE team='navi'")).rows[0].payload;
    assert.equal(digest.mode,"facts"); assert.ok(digest.items.length);
    const originalFetch=globalThis.fetch;
    const originalKey=process.env.OPENAI_API_KEY;
    const originalModel=process.env.OPENAI_MODEL;
    let calls=0;
    try {
      process.env.OPENAI_API_KEY="test-key";process.env.OPENAI_MODEL="test-model";
      globalThis.fetch=async (_url,init) => {
        calls++;
        const request=JSON.parse(String(init?.body));
        assert.equal(request.store,false);
        return new Response(JSON.stringify({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({factIds:["roster"]})}]}]}),{status:200});
      };
      await updateDigest(client,NAVI);
      await updateDigest(client,NAVI);
      assert.equal(calls,1,"unchanged sourced facts must not incur another API call");
      assert.equal((await db.query<{mode:string}>("SELECT mode FROM digests WHERE team='navi'")).rows[0].mode,"ai");
      process.env.OPENAI_MODEL="test-failing-model";
      globalThis.fetch=async () => new Response("unavailable",{status:503});
      await updateDigest(client,NAVI);
      assert.equal((await db.query<{mode:string}>("SELECT mode FROM digests WHERE team='navi'")).rows[0].mode,"facts");
    } finally {
      globalThis.fetch=originalFetch;
      if(originalKey) process.env.OPENAI_API_KEY=originalKey;else delete process.env.OPENAI_API_KEY;
      if(originalModel) process.env.OPENAI_MODEL=originalModel;else delete process.env.OPENAI_MODEL;
    }
    // A news outage and a failed NAVI match source must not block FaZe or either roster.
    const savedToken=process.env.PANDASCORE_TOKEN;
    const savedAi=process.env.OPENAI_API_KEY;
    const savedSource=process.env.MATCH_SOURCE;
    const fixtureWiki=`==Player Roster==\n===Active===\n${Array.from({length:5},(_,i) => `{{Person|id=fixture${i}|flag=ua}}`).join("\n")}\n===Former===`;
    try {
      delete process.env.PANDASCORE_TOKEN;delete process.env.OPENAI_API_KEY;
      process.env.MATCH_SOURCE="liquipedia";
      globalThis.fetch=async (url,init) => {
        if(String(url).startsWith("https://navi.gg/")) return new Response("outage",{status:503});
        if(String(url).startsWith("https://fazeclan.com/")) return new Response('<feed xmlns="http://www.w3.org/2005/Atom"></feed>');
        const params=new URLSearchParams(String(init?.body));
        const question=params.get("question") || "";
        let body:unknown;
        if(params.get("prop")==="revisions") body={query:{pages:[{revisions:[{slots:{main:{content:fixtureWiki}}}]}]}};
        else if(params.get("prop")==="extlinks") body={query:{pages:[]}};
        else if(question.includes('lpdb("player"')) body={return:"[]"};
        else if(question.includes("opponent::Natus Vincere")) body={type:"error",message:"simulated match outage"};
        else body={return:JSON.stringify({matches:[raw],forms:{},wiki:fixtureWiki})};
        return new Response(JSON.stringify(body),{headers:{"Content-Type":"application/json"}});
      };
      const partial=await runSync({force:true},client);
      assert.ok(partial.errors.some((e) => e.includes("NAVI · matches")));
      assert.ok(partial.errors.some((e) => e.includes("NAVI · posts")));
      assert.ok(!partial.errors.some((e) => e.includes("FaZe")));
      const successes=(await db.query<{team:string;scope:string;error:string|null}>("SELECT team,scope,error FROM source_checks")).rows;
      assert.equal(successes.find((c) => c.team==="faze" && c.scope==="matches")?.error,null);
      assert.equal(successes.find((c) => c.team==="navi" && c.scope==="roster")?.error,null);
      assert.ok((await db.query("SELECT * FROM posts WHERE team='navi'")).rows.length,"unavailable news must preserve saved posts");
    } finally {
      globalThis.fetch=originalFetch;
      if(savedToken) process.env.PANDASCORE_TOKEN=savedToken;else delete process.env.PANDASCORE_TOKEN;
      if(savedAi) process.env.OPENAI_API_KEY=savedAi;else delete process.env.OPENAI_API_KEY;
      if(savedSource) process.env.MATCH_SOURCE=savedSource;else delete process.env.MATCH_SOURCE;
    }
  } finally { await db.close(); }
}
databaseTests().then(() => console.log("reliability tests ok (embedded PostgreSQL)")).catch((error) => { console.error(error);process.exitCode=1; });
