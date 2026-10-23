import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { bandText, berlinClock, berlinLong, dateBadge, pillsFor, wikiUrl } from "@/lib/format";
import { winDisclaimer } from "@/lib/winband";
import type { SeriesVM } from "@/lib/types";

export function SeriesHero({ series, heading = "h2" }: { series: SeriesVM; heading?: "h1" | "h2" }) {
  const pills = pillsFor(series);
  const Title = heading;
  return (
    <article className="hero">
      <div className="hero-top">
        <p className="badge">{dateBadge(series.at)}</p>
        <p className="clock">{berlinClock(series.at)}</p>
      </div>
      <p className="event">{series.eventLabel}</p>
      <p className="versus">NAVI проти</p>
      <Title>{series.opponent}</Title>
      <ul className="pills">
        {pills.map((pill) => (
          <li key={pill}>{pill}</li>
        ))}
      </ul>
      {series.finished ? (
        <Score series={series} />
      ) : (
        <>
          <Countdown iso={series.at} />
          {series.winLow != null && series.winHigh != null ? (
            <WinBand low={series.winLow} high={series.winHigh} reasons={series.reasons} />
          ) : null}
        </>
      )}
    </article>
  );
}

export function Score({ series }: { series: SeriesVM }) {
  const outcome = series.naviWon === true ? "Перемога" : series.naviWon === false ? "Поразка" : "Нічия";
  return (
    <div className={`scoreline ${series.naviWon === true ? "won" : series.naviWon === false ? "lost" : ""}`}>
      <p className="outcome">{outcome}</p>
      <div className="score-nums">
        <div>
          <b>{series.naviScore ?? "–"}</b>
          <span>NAVI</span>
        </div>
        <i>:</i>
        <div>
          <b>{series.oppScore ?? "–"}</b>
          <span>{series.opponent}</span>
        </div>
      </div>
    </div>
  );
}

export function WinBand({ low, high, reasons }: { low: number; high: number; reasons: string[] }) {
  return (
    <div className="band">
      <div className="band-top">
        <span>Шанс серії</span>
        <strong>{bandText(low, high)}</strong>
      </div>
      <div className="track" aria-hidden="true">
        <i style={{ left: `${low}%`, width: `${Math.max(high - low, 1)}%` }} />
      </div>
      {reasons.length ? (
        <ul className="reasons">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <p className="disclaimer">{winDisclaimer()}</p>
    </div>
  );
}

export function SeriesList({ title, items }: { title: string; items: SeriesVM[] }) {
  if (!items.length) return null;
  return (
    <section className="block">
      <h2>{title}</h2>
      <ul className="rows">
        {items.map((series) => (
          <li key={series.id}>
            <Link href={`/matches/${series.id}`}>
              <span className="row-when">{dateBadge(series.at)}</span>
              <span className="row-main">
                <strong>{series.opponent}</strong>
                <em>{series.eventLabel}</em>
              </span>
              <span className={`row-end ${series.finished ? (series.naviWon ? "won" : "lost") : ""}`}>
                {series.finished
                  ? `${series.naviScore ?? "–"}:${series.oppScore ?? "–"}`
                  : series.winLow != null && series.winHigh != null
                    ? bandText(series.winLow, series.winHigh)
                    : berlinClock(series.at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MapList({ series }: { series: SeriesVM }) {
  if (!series.maps.length) {
    return <p className="note">Карти з’являться після серії.</p>;
  }
  return (
    <ul className="maps">
      {series.maps.map((map) => (
        <li key={map.id} className={map.naviWon ? "won" : map.naviWon === false ? "lost" : ""}>
          <span>{map.name}</span>
          <b>
            {map.navi ?? "–"}:{map.opp ?? "–"}
          </b>
          {map.vod ? (
            <a href={map.vod} target="_blank" rel="noreferrer">
              VOD
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function Lineup({ title, people }: { title: string; people: SeriesVM["naviPlayers"] }) {
  const showKd = people.some((person) => person.kills != null && person.deaths != null);
  return (
    <section className="block">
      <h2>{title}</h2>
      <ul className="lineup">
        {people.map((person) => (
          <li key={`${person.displayname}-${person.name}`}>
            <b>{person.displayname || person.name}</b>
            {person.kills != null && person.deaths != null ? (
              <span>
                K/D {person.kills}/{person.deaths}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {!showKd ? <p className="note">K/D у цьому матчі джерело не дало. Rating 2.0, ADR і KAST не вигадуємо.</p> : null}
    </section>
  );
}

export function SourceLink({ pageName }: { pageName: string | null }) {
  if (!pageName) return null;
  return (
    <p className="source-link">
      <a href={wikiUrl(pageName)}>Сторінка на Liquipedia</a>
    </p>
  );
}

export function WhenLine({ iso }: { iso: string }) {
  return <p className="when-line">{berlinLong(iso)}</p>;
}
