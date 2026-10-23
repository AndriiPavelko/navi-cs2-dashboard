"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionOf, teamFromPath, teamHref, type TeamId } from "@/lib/teams";

const ITEMS: Array<{ section: "/" | "/matches" | "/players" | "/pulse"; label: string }> = [
  { section: "/", label: "Головна" },
  { section: "/matches", label: "Матчі" },
  { section: "/players", label: "Гравці" },
  { section: "/pulse", label: "Пульс" },
];

export function BottomNav() {
  const path = usePathname() || "/";
  const team: TeamId = teamFromPath(path);
  const section = sectionOf(path);
  return (
    <nav className="tabbar" aria-label="Розділи">
      {ITEMS.map((item) => {
        const href = teamHref(team, item.section);
        const on = section === item.section;
        return (
          <Link key={item.section} href={href} aria-current={on ? "page" : undefined} className={on ? "on" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
