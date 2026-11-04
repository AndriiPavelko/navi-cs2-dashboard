import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { backtest } from "../lib/forecast";
import { TEAM_LIST } from "../lib/teams";
import type { RawMatch } from "../lib/sync/raw";
import { fetchHistoricalMatches } from "../lib/sync/liquipedia";

async function main() {
  const input = process.argv.find((arg) => arg.startsWith("--input="))?.slice(8);
  const since = process.argv.find((arg) => arg.startsWith("--since="))?.slice(8) ?? (input ? null : "2026-01-01");
  const raw: unknown = input ? JSON.parse(await readFile(resolve(input),"utf8")) : await fetchHistoricalMatches(since!);
  if (!Array.isArray(raw)) throw new Error("Історичний файл має містити масив матчів Liquipedia");
  const reports = TEAM_LIST.map((team) => backtest(raw as RawMatch[],team));
  const dates = (raw as RawMatch[]).map((row) => row.date).filter((date): date is string => Boolean(date)).sort();
  await mkdir(resolve("reports"),{recursive:true});
  if (!input) await writeFile(resolve("reports/history.json"),JSON.stringify(raw));
  await writeFile(resolve("reports/backtest.json"),JSON.stringify({generatedAt:new Date().toISOString(),source:"Liquipedia",inputFile:input ?? null,since,
    dataRange:{from:dates[0] ?? null,to:dates.at(-1) ?? null,matches:raw.length},reports},null,2));
  console.log(JSON.stringify(reports.map(({rows,...report}) => report),null,2));
  console.log("Повний звіт: reports/backtest.json. Відсотки в інтерфейсі залишаються прихованими.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Помилка історичного тесту"); process.exitCode=1; });
