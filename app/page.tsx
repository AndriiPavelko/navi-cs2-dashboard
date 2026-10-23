import { SeriesHero, SeriesList } from "@/components/series-view";
import { getAllSeries } from "@/lib/data";
import { percent } from "@/lib/format";
import { seasonStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const series = await getAllSeries();
  const upcoming = series.filter((item) => !item.finished).sort((a, b) => a.at.localeCompare(b.at));
  const finished = series.filter((item) => item.finished).sort((a, b) => b.at.localeCompare(a.at));
  const next = upcoming[0] ?? finished[0] ?? null;
  const stats = seasonStats(series);
  const later = upcoming.slice(next && !next.finished ? 1 : 0);
  const recent = finished.slice(0, 5);

  return (
    <>
      <h1 className="hello">Привіт, Andrii</h1>
      <p className="hello-sub">Сезон NAVI CS2, 2026</p>
      {next ? (
        <SeriesHero series={next} />
      ) : (
        <section className="hero empty-hero">
          <h2>Розклад ще порожній</h2>
          <p>Натисни «Оновити», щоб забрати сезон з Liquipedia.</p>
        </section>
      )}
      <section className="block">
        <h2>Сезон 2026</h2>
        <dl className="stats">
          <div>
            <dt>Серії</dt>
            <dd>{stats.series}</dd>
          </div>
          <div>
            <dt>Перемоги</dt>
            <dd>{stats.wins}</dd>
          </div>
          <div>
            <dt>Поразки</dt>
            <dd>{stats.losses}</dd>
          </div>
          <div>
            <dt>Вінрейт</dt>
            <dd>{stats.winRate}</dd>
          </div>
          <div>
            <dt>Карти</dt>
            <dd>
              {stats.mapWins}–{stats.mapLosses}
            </dd>
          </div>
          <div>
            <dt>Серія</dt>
            <dd>{stats.streak}</dd>
          </div>
        </dl>
        {stats.draws ? <p className="note">Нічиї: {stats.draws}. У вінрейт вони не входять.</p> : null}
        <p className="note">
          Вінрейт серій {percent(stats.wins, stats.wins + stats.losses)}. Карти рахуються лише там, де Liquipedia дала
          переможця.
        </p>
      </section>
      <SeriesList title={later.length ? "Далі в розкладі" : "Останні серії"} items={later.length ? later : recent} />
    </>
  );
}
