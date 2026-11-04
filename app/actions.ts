"use server";

import { revalidatePath } from "next/cache";
import { runSync } from "@/lib/sync/run";

export async function refreshDashboard(): Promise<{ ok: boolean; error?: string; summary?: string }> {
  try {
    const summary = await runSync({ force: true });
    revalidatePath("/", "layout");
    return {
      ok: summary.errors.length === 0,
      error: summary.errors.length ? `Часткове оновлення: ${summary.errors.join("; ")}`.slice(0,280) : undefined,
      summary: `${summary.matches} серій · склад ${summary.roster}${summary.warnings.length ? " · є зауваження до джерел" : ""}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не вдалося оновити";
    return { ok: false, error: message.slice(0, 280) };
  }
}
