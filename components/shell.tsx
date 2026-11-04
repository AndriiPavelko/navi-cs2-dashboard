import { BottomNav } from "./bottom-nav";
import { SourceCredit, TopBar } from "./top-bar";
import { SourceStatus } from "./source-status";
import type { SourceCheck } from "@/lib/sync/schedule";
import { usesBo3 } from "@/lib/sources";

export function Shell({
  children,
  checks,
  dbError,
}: {
  children: React.ReactNode;
  checks: SourceCheck[];
  dbError: string | null;
}) {
  return (
    <div className="phone">
      <TopBar checks={checks} />
      {dbError ? <p className="banner">{dbError}</p> : null}
      <SourceStatus checks={checks} />
      <main>{children}</main>
      <SourceCredit bo3={usesBo3()} />
      <BottomNav />
    </div>
  );
}
