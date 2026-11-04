import { setTimeout } from "node:timers/promises";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const { runSync } = await import("../lib/sync/run");
  const { endPool } = await import("../lib/db");
  let stopping = false;
  const controller = new AbortController();
  const stop = () => { stopping = true; controller.abort(); };
  process.on("SIGINT",stop); process.on("SIGTERM",stop);
  console.log("NAVI / FaZe: моніторинг запущено. Ctrl+C — зупинити.");
  try {
    while (!stopping) {
      try {
        const summary = await runSync();
        if (summary.skipped < 6 || summary.errors.length) console.log(JSON.stringify({at:new Date().toISOString(),...summary}));
      } catch { console.error("Не вдалося виконати перевірку. Наступна спроба через хвилину."); }
      if (!stopping) await setTimeout(60_000,undefined,{signal:controller.signal}).catch(() => undefined);
    }
  } finally { await endPool(); }
}
main().catch(() => { console.error("Моніторинг не запущено"); process.exitCode=1; });
