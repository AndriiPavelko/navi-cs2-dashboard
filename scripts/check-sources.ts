import { PGlite } from "@electric-sql/pglite";
import type { PoolClient } from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runSync } from "../lib/sync/run";

// Public source requests, but all writes go to an isolated in-memory PostgreSQL.
async function main() {
  const db = new PGlite();
  const client = { query: async (sql:string,params?:unknown[]) => params?.length ? db.query(sql,params) : (await db.exec(sql)).at(-1) } as unknown as PoolClient;
  try {
    const summary = await runSync({force:true},client);
    const checks = (await db.query("SELECT * FROM source_checks ORDER BY team,scope")).rows;
    const result = { checkedAt:new Date().toISOString(),summary,checks };
    await mkdir(resolve("reports"),{recursive:true});
    await writeFile(resolve("reports/source-check.json"),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
    if (summary.errors.length) process.exitCode=1;
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Перевірка не вдалася");process.exitCode=1; });
