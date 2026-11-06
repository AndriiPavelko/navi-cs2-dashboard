import { readFile,writeFile,mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { asArray,type RawMatch,type RawOpponent } from "../lib/sync/raw";
import { normalizeMatch } from "../lib/sync/normalize";
import { NAVI } from "../lib/teams";
import type { SideSeries } from "../lib/sync/bo3";
import { predictSeries } from "../lib/series-model";

async function main(){
  const input=process.argv.find(a=>a.startsWith("--input="))?.slice(8)??"reports/history.json";
  const raw:unknown=JSON.parse(await readFile(resolve(input),"utf8"));
  if(!Array.isArray(raw))throw new Error("Потрібен масив матчів Liquipedia; спочатку npm run backtest");
  const ids=new Map<string,number>();
  const key=(s:string)=>s.trim().toLowerCase();
  const id=(s:string)=>{const n=key(s);if(!ids.has(n))ids.set(n,ids.size+1);return ids.get(n)!;};
  const rows:SideSeries[]=[];
  for(const r of raw as RawMatch[]){
    const sides=asArray<RawOpponent>(r.match2opponents);
    if(sides.length!==2 || !sides[0].name || !sides[1].name)continue;
    const n=normalizeMatch(r,{...NAVI,name:key(sides[0].name),templatePrefix:sides[0].template??""});
    if(!n?.finished || n.resultKind!=="played")continue;
    rows.push({id:n.id,at:n.at.toISOString(),teamId:id(sides[0].name),opponentId:id(sides[1].name),opponentName:sides[1].name,
      tournament:n.tournament,tier:n.tier,bestOf:n.bestOf,url:"https://liquipedia.net/counterstrike/",finished:true,resultKind:n.resultKind,
      ownScore:n.naviScore,oppScore:n.opponentScore,ownWon:n.naviWon,
      maps:n.maps.map(m=>({name:m.mapName,own:m.naviScore,opp:m.opponentScore,ownWon:m.naviWon,position:m.position}))});
  }
  const targets=new Set([ids.get("natus vincere"),ids.get("faze clan")].filter((n):n is number=>n!=null));
  const evaluated:Array<{id:string;predicted:number;actual:number;asOf:string}>=[];
  const eligible=rows.filter(r=>r.bestOf===3 && (targets.has(r.teamId)||targets.has(r.opponentId)));
  for(const row of eligible){
    const p=predictSeries({match:row,history:rows,asOf:new Date(Date.parse(row.at)-86400000).toISOString()});
    if(p)evaluated.push({id:row.id,predicted:p.independent,actual:Number(row.ownWon),asOf:p.asOf});
  }
  const n=evaluated.length;
  const result={version:"map-elo-v1",generatedAt:new Date().toISOString(),input,eligible:eligible.length,evaluated:n,
    brier:n ? evaluated.reduce((s,r)=>s+(r.predicted-r.actual)**2,0)/n:null,
    logLoss:n ? -evaluated.reduce((s,r)=>s+r.actual*Math.log(r.predicted)+(1-r.actual)*Math.log(1-r.predicted),0)/n:null,
    baselineBrier:0.25,baselineLogLoss:Math.log(2),
    caveats:["Поточна виправлена історія Liquipedia; не архівні знімки bo3.gg. Порівняння з live потребує накопичення prediction_snapshots.",
      "Без історичних veto, складів та котирувань. Застосовано відступ 24 години. Результат не доводить прибутковість ставок."],rows:evaluated};
  await mkdir(resolve("reports"),{recursive:true});
  await writeFile(resolve("reports/map-model-evaluation.json"),JSON.stringify(result,null,2));
  const {rows:_,...summary}=result;console.log(JSON.stringify(summary,null,2));
}
main().catch(e=>{console.error(e instanceof Error ? e.message:"Помилка оцінювання");process.exitCode=1;});
