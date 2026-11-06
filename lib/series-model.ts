import type { SideSeries } from "./sync/bo3";

const DAY=86400000;
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const logistic=(x:number)=>1/(1+Math.exp(-x));
const logit=(p:number)=>Math.log(p/(1-p));
export type MarketQuote={bookmaker:string;url:string;at:string;team:number;opponent:number};
export type SeriesPrediction={
  version:string;asOf:string;stage:"scenarios"|"confirmed";team:number;independent:number;third:number|null;
  scores:Record<string,number>;maps:Array<{name:string;probability:number;ownSamples:number;opponentSamples:number}>;
  scenarios:number;sample:number;reasons:string[];warnings:string[];
  market:{probability:number|null;weight:number;books:number;note:string;sources?:Array<{name:string;url:string;observedAt:string;teamOdds:number;opponentOdds:number}>};
};

/** Remove each book's two-way margin before combining independent books. */
export function marketProbability(quotes:MarketQuote[],asOf:string){
  const valid=new Map<string,number>();
  for(const q of quotes){
    const age=Date.parse(asOf)-Date.parse(q.at);
    if(!q.bookmaker || age<0 || age>3600000 || !Number.isFinite(q.team) || !Number.isFinite(q.opponent) || q.team<=1 || q.opponent<=1)continue;
    const a=1/q.team,b=1/q.opponent;
    if(a+b<0.95 || a+b>1.3)continue;
    valid.set(q.bookmaker.toLowerCase(),a/(a+b));
  }
  const sorted=[...valid.values()].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return {probability:sorted.length ? sorted.length%2 ? sorted[mid]:(sorted[mid-1]+sorted[mid])/2:null,books:sorted.length};
}

export function scoreDistribution(p:number[]){
  const [a,b,c]=p;
  return {"2:0":a*b,"2:1":(a*(1-b)+(1-a)*b)*c,"1:2":(a*(1-b)+(1-a)*b)*(1-c),"0:2":(1-a)*(1-b)};
}

/** Deterministic, chronological Elo over the collected match graph; no current rankings in historical features. */
export function predictSeries(input:{match:SideSeries;history:SideSeries[];asOf:string;confirmedMaps?:string[];quotes?:MarketQuote[]}):SeriesPrediction|null{
  const {match}=input;
  const cutoff=Math.min(Date.parse(input.asOf),Date.parse(match.at));
  const unique=new Map<string,SideSeries>();
  for(const row of input.history){
    const date=Date.parse(row.at);
    if(row.id===match.id || !Number.isFinite(date) || date>=cutoff || !row.finished || row.ownWon==null || (row.resultKind && row.resultKind!=="played"))continue;
    if(!unique.has(row.id))unique.set(row.id,row);
  }
  const history=[...unique.values()].sort((a,b)=>a.at.localeCompare(b.at));
  const counts=new Map<number,number>();
  const ratings=new Map<number,number>();
  const mapRatings=new Map<string,number>();
  const played=new Map<string,number>();
  const mapName=(name:string)=>name.replace(/^de_/i,"").trim().toLowerCase();
  const elo=(id:number)=>ratings.get(id)??1500;
  for(const row of history){
    const age=(cutoff-Date.parse(row.at))/DAY;
    const decay=Math.pow(0.5,age/60);
    const usable=row.maps.filter(m=>m.ownWon!=null && m.name && !/карта|default|tba|tbd/i.test(m.name));
    const expected=1/(1+10**((elo(row.opponentId)-elo(row.teamId))/400));
    const result=usable.length ? usable.filter(m=>m.ownWon).length/usable.length:Number(row.ownWon);
    const delta=32*decay*(result-expected);
    ratings.set(row.teamId,elo(row.teamId)+delta);ratings.set(row.opponentId,elo(row.opponentId)-delta);
    if(age<=90){counts.set(row.teamId,(counts.get(row.teamId)??0)+1);counts.set(row.opponentId,(counts.get(row.opponentId)??0)+1);}
    for(const m of usable){
      const name=mapName(m.name),a=`${row.teamId}:${name}`,b=`${row.opponentId}:${name}`;
      const ar=mapRatings.get(a)??1500,br=mapRatings.get(b)??1500;
      const e=1/(1+10**((br-ar)/400));
      const change=28*decay*(Number(m.ownWon)-e);
      mapRatings.set(a,ar+change);mapRatings.set(b,br-change);
      if(age<=90){played.set(a,(played.get(a)??0)+1);played.set(b,(played.get(b)??0)+1);}
    }
  }
  const ownN=counts.get(match.teamId)??0,oppN=counts.get(match.opponentId)??0;
  if(ownN<3 || oppN<3)return null;
  const observed=new Map<string,number>();
  for(const row of history.filter(r=>cutoff-Date.parse(r.at)<=60*DAY))for(const m of row.maps){
    if(m.ownWon==null || !m.name || /карта|default|tba|tbd/i.test(m.name))continue;
    const n=mapName(m.name);observed.set(n,(observed.get(n)??0)+1);
  }
  const confirmed=input.confirmedMaps?.map(mapName);
  if(confirmed && (confirmed.length!==3 || new Set(confirmed).size!==3))throw new Error("Потрібні три різні карти офіційного veto");
  const pool=confirmed ?? [...observed].sort((a,b)=>b[1]-a[1]).slice(0,7).map(([name])=>name);
  const maps=pool.map(name=>{
    const a=`${match.teamId}:${name}`,b=`${match.opponentId}:${name}`;
    const an=played.get(a)??0,bn=played.get(b)??0;
    const reliability=Math.min(an,bn)/(Math.min(an,bn)+10);
    const mapDiff=(mapRatings.get(a)??1500)-(mapRatings.get(b)??1500);
    const globalDiff=elo(match.teamId)-elo(match.opponentId);
    return {name,probability:clamp(1/(1+10**(-((1-reliability)*globalDiff+reliability*mapDiff)/400)),0.1,0.9),ownSamples:an,opponentSamples:bn};
  });
  const scores:Record<string,number>={"2:0":0,"2:1":0,"1:2":0,"0:2":0};
  let scenarios=0,totalWeight=0;
  if(match.bestOf===3 && pool.length>=3){
    for(let a=0;a<maps.length;a++)for(let b=0;b<maps.length;b++)for(let c=0;c<maps.length;c++){
      if(a===b || b===c || a===c || (confirmed && (a!==0 || b!==1 || c!==2)))continue;
      // Map appearances are only a scenario proxy, never claimed to be observed picks/bans.
      const weight=confirmed ? 1:(maps[a].ownSamples+2)*(maps[b].opponentSamples+2);
      for(const shift of [-0.3,0,0.3]){
        const distribution=scoreDistribution([a,b,c].map(i=>logistic(logit(maps[i].probability)+shift)));
        for(const key of Object.keys(scores))scores[key]+=distribution[key as keyof typeof distribution]*weight/3;
      }
      totalWeight+=weight;scenarios++;
    }
    for(const key of Object.keys(scores))scores[key]/=totalWeight || 1;
  }
  const hasSeries=totalWeight>0;
  const independent=hasSeries ? scores["2:0"]+scores["2:1"]:1/(1+10**((elo(match.opponentId)-elo(match.teamId))/400));
  const market=marketProbability(input.quotes??[],input.asOf);
  const correction=market.probability==null ? 0:clamp(0.1*(market.probability-independent),-0.03,0.03);
  const team=clamp(independent+correction,0.01,0.99);
  if(hasSeries && correction){
    for(const key of ["2:0","2:1"])scores[key]*=team/independent;
    for(const key of ["0:2","1:2"])scores[key]*=(1-team)/(1-independent);
  }
  return {version:"map-elo-v1",asOf:input.asOf,stage:confirmed ? "confirmed":"scenarios",team,independent,
    third:hasSeries ? scores["2:1"]+scores["1:2"]:null,scores:hasSeries ? scores:{},maps,scenarios,sample:history.length,
    reasons:[`Рейтинг сили: ${Math.round(elo(match.teamId))} проти ${Math.round(elo(match.opponentId))}; сила суперників враховується через Elo`,
      `Матчі за 90 днів: ${ownN} та ${oppN}; внесок старих результатів зменшується вдвічі за 60 днів`,
      `Історія графа суперників: ${history.length} унікальних серій; покриття може бути неповним`],
    warnings:["Експериментальна модель: точність ще не підтверджена на незалежній вибірці",
      ...(confirmed ? ["Порядок карт взято з підтверджених даних джерела; це не незалежна перевірка організатора"]:["Підтверджений порядок карт не отримано. Пул і сценарії оцінено за зіграними картами, це не підтверджені picks/bans"]),
      ...(maps.some(m=>Math.min(m.ownSamples,m.opponentSamples)<5) ? ["Для частини карт мало спостережень; оцінка наближена до загальної сили команд"]:[])],
    market:{...market,weight:market.probability==null ? 0:0.1,
      sources:(input.quotes??[]).filter(q=>marketProbability([q],input.asOf).probability!=null).map(q=>({name:q.bookmaker,url:q.url,observedAt:q.at,teamOdds:q.team,opponentOdds:q.opponent})),
      note:market.probability==null ? "Безкоштовних актуальних котирувань немає; вага букмекерів 0%":"Маржу вилучено; вага 10%, вплив обмежено ±3 відсотковими пунктами. Час — отримання котирувань, не підтверджений час їх зміни у букмекера"}};
}
