import assert from "node:assert/strict";
import { predictSeries,marketProbability,scoreDistribution,type MarketQuote } from "../lib/series-model";
import type { SideSeries } from "../lib/sync/bo3";
import { publicQuotes } from "../lib/sync/bo3";

const at="2026-11-06T12:00:00Z";
const fixture=(id:string,date:string,a:number,b:number,won:boolean):SideSeries=>({id,at:date,teamId:a,opponentId:b,opponentName:String(b),tournament:"test",tier:"S-tier",bestOf:3,url:"https://bo3.gg/matches/test",finished:true,resultKind:"played",ownScore:won?2:0,oppScore:won?0:2,ownWon:won,maps:[{name:"Nuke",own:won?13:5,opp:won?5:13,ownWon:won,position:1},{name:"Mirage",own:won?13:5,opp:won?5:13,ownWon:won,position:2},{name:"Inferno",own:null,opp:null,ownWon:null,position:3}]});
const history:SideSeries[]=[];
for(let i=0;i<8;i++){
  history.push(fixture(`a${i}`,`2026-10-${String(i+1).padStart(2,"0")}T12:00:00Z`,1,3,true));
  history.push(fixture(`b${i}`,`2026-10-${String(i+1).padStart(2,"0")}T15:00:00Z`,2,3,false));
}
for(const row of history)if(row.id.endsWith("1"))row.maps[1].name="Inferno";
const match={...fixture("target","2026-11-07T12:00:00Z",1,2,true),finished:false,status:"scheduled" as const};
const p=predictSeries({match,history,asOf:at})!;
assert.ok(p);assert.ok(p.team>0.5);assert.equal(p.stage,"scenarios");
assert.ok(Math.abs(Object.values(p.scores).reduce((a,b)=>a+b,0)-1)<1e-9);
assert.ok(Math.abs(p.team-p.scores["2:0"]-p.scores["2:1"])<1e-9);
assert.ok(Math.abs(p.third!-p.scores["2:1"]-p.scores["1:2"])<1e-9);
assert.equal(p.market.weight,0);
assert.deepEqual(predictSeries({match,history:[...history,...history],asOf:at}),p);
assert.deepEqual(predictSeries({match,history:[...history,fixture("future","2026-11-08T12:00:00Z",1,2,false)],asOf:at}),p);
assert.equal(predictSeries({match,history:history.slice(0,2),asOf:at}),null);
const reversed=predictSeries({match:{...match,teamId:2,opponentId:1},history,asOf:at})!;
assert.ok(Math.abs(p.team+reversed.team-1)<1e-9);
const confirmed=predictSeries({match,history,asOf:at,confirmedMaps:["Nuke","Mirage","Inferno"]})!;
assert.equal(confirmed.stage,"confirmed");assert.equal(confirmed.scenarios,1);
assert.throws(()=>predictSeries({match,history,asOf:at,confirmedMaps:["Nuke","Nuke","Inferno"]}));
const quote:MarketQuote={bookmaker:"book",url:"https://example.com",at,team:4,opponent:1.3};
const adjusted=predictSeries({match,history,asOf:at,quotes:[quote]})!;
assert.ok(Math.abs(adjusted.team-p.team)<=0.0300001);
assert.ok(Math.abs(Object.values(adjusted.scores).reduce((a,b)=>a+b,0)-1)<1e-9);
assert.equal(marketProbability([{...quote,at:"2026-11-05T00:00:00Z"}],at).probability,null);
assert.equal(marketProbability([{...quote,team:NaN}],at).probability,null);
assert.deepEqual(scoreDistribution([0.5,0.5,0.5]),{"2:0":0.25,"2:1":0.25,"1:2":0.25,"0:2":0.25});
const bets={path:"https://thunderpick.io/match/1",provider:"thunderpick",team_1:{team_id:2,coeff:2.83,active:true},team_2:{team_id:1,coeff:1.37,active:true}};
assert.equal(publicQuotes(bets,1,2,at)[0].team,1.37);
assert.deepEqual(publicQuotes(bets,1,3,at),[]);
console.log("map/series model tests ok");
