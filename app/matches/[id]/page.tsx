import Link from "next/link";
import { notFound } from "next/navigation";
import { Lineup, MapList, SeriesHero, SourceLink, WhenLine } from "@/components/series-view";
import { getAllSeries } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = (await getAllSeries()).find((item) => item.id === id);
  if (!series) notFound();

  return (
    <>
      <p className="back">
        <Link href="/matches">Усі матчі</Link>
      </p>
      <SeriesHero series={series} heading="h1" />
      <WhenLine iso={series.at} />
      <section className="block">
        <h2>Карти</h2>
        <MapList series={series} />
      </section>
      {series.naviPlayers.length ? <Lineup title="Склад NAVI" people={series.naviPlayers} /> : null}
      {series.oppPlayers.length ? <Lineup title={`Склад ${series.opponent}`} people={series.oppPlayers} /> : null}
      <SourceLink pageName={series.pageName} />
    </>
  );
}
