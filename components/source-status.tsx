"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { berlinShort } from "@/lib/format";
import { teamFromPath } from "@/lib/teams";
import { isStale, type Scope, type SourceCheck } from "@/lib/sync/schedule";

const LABELS: Record<Scope,string> = { matches:"Матчі",roster:"Склад",posts:"Новини" };

export function SourceStatus({ checks }: { checks: SourceCheck[] }) {
  const team = teamFromPath(usePathname() || "/");
  const [now,setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()),60_000); return () => clearInterval(timer); },[]);
  const own = checks.filter((check) => check.team === team);
  const needsAttention = own.some((check) => check.error || (now != null && isStale(check,now)));
  return (
    <details className={`source-status ${needsAttention ? "attention" : ""}`}>
      <summary>{own.length ? needsAttention ? "Дані потребують уваги" : "Перевірки джерел" : "Джерела ще не перевірені"}</summary>
      {(["matches","roster","posts"] as Scope[]).map((scope) => {
        const check = own.find((item) => item.scope === scope);
        return <div key={scope} className="source-check">
          <strong>{LABELS[scope]}</strong>
          <p>{check?.succeededAt ? `Успішно перевірено ${berlinShort(check.succeededAt)}` : "Успішної перевірки ще немає"}</p>
          {check && now != null && isStale(check,now) ? <p className="source-error">Дані застаріли</p> : null}
          {check?.error ? <p className="source-error">Помилка: {check.error}. Попередні дані збережено.</p> : null}
          {check ? <p>Остання спроба: {berlinShort(check.attemptedAt)}</p> : null}
          {check?.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>;
      })}
    </details>
  );
}
