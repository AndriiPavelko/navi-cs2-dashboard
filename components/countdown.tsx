"use client";

import { useEffect, useState } from "react";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function label(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (days > 0) {
    const word = days % 10 === 1 && days % 100 !== 11 ? "день" : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 12 || days % 100 > 14) ? "дні" : "днів";
    return `${days} ${word} ${clock}`;
  }
  return clock;
}

export function Countdown({ iso }: { iso: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (now == null) return <p className="countdown">рахуємо час</p>;
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return <p className="countdown">Матч уже почався</p>;
  return (
    <p className="countdown" aria-live="polite">
      <span>до старту</span>
      {label(Math.floor(diff / 1000))}
    </p>
  );
}
