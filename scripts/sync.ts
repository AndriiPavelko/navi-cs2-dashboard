import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): void {
  const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnv();
  const { runSync } = await import("../lib/sync/run");
  const { endPool } = await import("../lib/db");
  try {
    const summary = await runSync();
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await endPool();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
