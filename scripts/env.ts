import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(): void {
  const path = resolve(process.cwd(),".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path,"utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const raw = match[2];
    process.env[match[1]] = /^(["']).*\1$/.test(raw) ? raw.slice(1,-1) : raw;
  }
}
