import { loadEnv } from "./env";

async function main(): Promise<void> {
  loadEnv();
  const { runSync } = await import("../lib/sync/run");
  const { endPool } = await import("../lib/db");
  try {
    const summary = await runSync({ force: process.argv.includes("--force") });
    console.log(JSON.stringify(summary, null, 2));
    if (summary.errors.length) process.exitCode = 1;
  } finally {
    await endPool();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
