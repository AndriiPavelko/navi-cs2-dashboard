"use server";

import { revalidatePath } from "next/cache";
import { runSync } from "@/lib/sync/run";

export async function refreshDashboard(): Promise<{ ok: boolean; error?: string; summary?: string }> {
  try {
    const summary = await runSync();
    revalidatePath("/", "layout");
    return {
      ok: true,
      summary: `${summary.matches} серій · склад ${summary.roster}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не вдалося оновити";
    return { ok: false, error: message.slice(0, 280) };
  }
}
