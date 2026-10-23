"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Головна" },
  { href: "/matches", label: "Матчі" },
  { href: "/players", label: "Гравці" },
  { href: "/pulse", label: "Пульс" },
];

function active(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Розділи">
      {ITEMS.map((item) => {
        const on = active(path, item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} className={on ? "on" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
