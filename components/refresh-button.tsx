"use client";

import { useState, useTransition } from "react";

type Result = { ok: boolean; error?: string; summary?: string };

export function RefreshButton({ action }: { action: () => Promise<Result> }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="refresh">
      <button
        type="button"
        className="refresh-btn"
        disabled={pending}
        onClick={() => {
          setNote(null);
          start(async () => {
            const result = await action();
            setNote(result.ok ? "Готово" : result.error || "Помилка");
          });
        }}
      >
        {pending ? "Оновлюємо…" : "Оновити"}
      </button>
      {note ? <span className="refresh-note">{note}</span> : null}
    </div>
  );
}
