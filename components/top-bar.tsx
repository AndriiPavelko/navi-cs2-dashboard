"use client";

import { refreshDashboard } from "@/app/actions";
import { berlinShort } from "@/lib/format";
import { TEAM_LIST, TEAMS, sectionOf, teamFromPath, teamHref } from "@/lib/teams";
import { usePathname } from "next/navigation";
import { RefreshButton } from "./refresh-button";
import type { SourceCheck } from "@/lib/sync/schedule";

export function TopBar({ checks }: { checks: SourceCheck[] }) {
  const path = usePathname() || "/";
  const team = teamFromPath(path);
  const profile = TEAMS[team];
  const section = sectionOf(path);
  const syncedAt = checks.find((check) => check.team === team && check.scope === "matches")?.succeededAt;

  return (
    <header className="top">
      <div>
        <a className="brand" href={teamHref(team, "/")}>
          {profile.label === "NAVI" ? (
            <>
              NA<span>VI</span>
            </>
          ) : (
            <>
              Fa<span>Ze</span>
            </>
          )}
        </a>
        <nav className="switch" aria-label="Команда">
          {TEAM_LIST.map((item) => (
            <a key={item.id} href={teamHref(item.id, section)} className={item.id === team ? "on" : undefined} aria-current={item.id === team ? "page" : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="top-side">
        {syncedAt ? <p className="synced">матчі · {berlinShort(syncedAt)}</p> : <p className="synced">CS2 · ще не перевірено</p>}
        <RefreshButton action={refreshDashboard} />
      </div>
    </header>
  );
}

export function SourceCredit({ bo3 = true }: { bo3?: boolean }) {
  const path = usePathname() || "/";
  const profile = TEAMS[teamFromPath(path)];
  return (
    <p className="credit">
      Дані: <a href={bo3 ? `https://bo3.gg/teams/${profile.bo3Slug}` : `https://liquipedia.net/counterstrike/${profile.wiki}`}>{profile.label} на {bo3 ? "bo3.gg":"Liquipedia"}</a>
      <span>{bo3 ? " · кіли, смерті, ADR, рейтинг bo3 · без KAST і без HLTV Rating" : " · CC BY-SA"}</span>
    </p>
  );
}
