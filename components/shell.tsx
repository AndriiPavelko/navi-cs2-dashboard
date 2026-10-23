import { refreshDashboard } from "@/app/actions";
import { berlinShort } from "@/lib/format";
import { BottomNav } from "./bottom-nav";
import { RefreshButton } from "./refresh-button";

export function Shell({
  children,
  syncedAt,
  dbError,
}: {
  children: React.ReactNode;
  syncedAt: string | null;
  dbError: string | null;
}) {
  return (
    <div className="phone">
      <header className="top">
        <a className="brand" href="/">
          NA<span>VI</span>
        </a>
        <div className="top-side">
          {syncedAt ? <p className="synced">синк {berlinShort(syncedAt)}</p> : <p className="synced">CS2 · 2026</p>}
          <RefreshButton action={refreshDashboard} />
        </div>
      </header>
      {dbError ? <p className="banner">{dbError}</p> : null}
      <main>{children}</main>
      <p className="credit">
        Дані: <a href="https://liquipedia.net/counterstrike/Natus_Vincere">Liquipedia</a>
        <span> · CC BY-SA · не HLTV</span>
      </p>
      <BottomNav />
    </div>
  );
}
