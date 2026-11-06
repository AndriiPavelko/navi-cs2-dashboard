import { sourceFetch } from "./http";
import type { MarketQuote } from "../series-model";

/** Optional free public JSON feed, not a paid service. No token or account is required. */
export async function fetchPublicMarket():Promise<Map<string,MarketQuote[]>>{
  const out=new Map<string,MarketQuote[]>();
  const endpoint=process.env.ODDS_PUBLIC_FEED_URL;
  if(!endpoint)return out;
  if(new URL(endpoint).protocol!=="https:")throw new Error("Публічна стрічка коефіцієнтів має використовувати HTTPS");
  const rows:unknown=await (await sourceFetch(endpoint,{cache:"no-store"})).json();
  if(!Array.isArray(rows))throw new Error("Неправильний формат публічних котирувань");
  for(const row of rows.slice(0,1000)){
    if(!row || typeof row!=="object" || typeof row.matchId!=="string" || typeof row.bookmaker!=="string" ||
      typeof row.at!=="string" || typeof row.url!=="string" || !/^https:\/\//.test(row.url) ||
      typeof row.team!=="number" || typeof row.opponent!=="number")continue;
    const values=out.get(row.matchId)??[];
    values.push({bookmaker:row.bookmaker,url:row.url,at:row.at,team:row.team,opponent:row.opponent});
    out.set(row.matchId,values);
  }
  return out;
}
