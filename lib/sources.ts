import { wikiUrl } from "./format";

/** Keep both providers available without mixing two IDs for the same real match. */
export function usesBo3(): boolean {
  return process.env.MATCH_SOURCE !== "liquipedia";
}

export function primaryLabel(): string {
  return usesBo3() ? "bo3.gg" : "Liquipedia";
}

export function matchSource(page: string | null, fallback: string): { name: string; url: string } {
  return page?.startsWith("https://bo3.gg/") ? { name:"bo3.gg",url:page } : { name:"Liquipedia",url:wikiUrl(page || fallback) };
}
