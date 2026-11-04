/** Bound every source request; never let an unavailable optional feed stop match updates. */
export async function sourceFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Джерело відповіло HTTP ${response.status}`);
  return response;
}
