import { SeriesList } from "@/components/series-view";
import { getAllSeries } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const series = await getAllSeries();
  const upcoming = series.filter((item) => !item.finished).sort((a, b) => a.at.localeCompare(b.at));
  const finished = series.filter((item) => item.finished).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <h1>Матчі</h1>
      <p className="lede">Усі серії NAVI CS2 з 1 січня 2026. Час — за Берліном.</p>
      {upcoming.length ? <SeriesList title="Далі" items={upcoming} /> : <p className="note">Майбутніх серій у джерелі зараз немає.</p>}
      <SeriesList title="Зіграні" items={finished} />
      {!series.length ? <p className="note">Після синку тут з’являться матчі сезону.</p> : null}
    </>
  );
}
