import { BottomNav } from "./bottom-nav";
import { SourceCredit, TopBar } from "./top-bar";

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
      <TopBar syncedAt={syncedAt} />
      {dbError ? <p className="banner">{dbError}</p> : null}
      <main>{children}</main>
      <SourceCredit />
      <BottomNav />
    </div>
  );
}
