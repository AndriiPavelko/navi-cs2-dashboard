import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { MISSING_FIELDS } from "@/lib/chance";
import { bandText, berlinClock, berlinLong, dateBadge, midPercent, pairPercents, pillsFor, wikiUrl } from "@/lib/format";
import { matchHref, TEAMS } from "@/lib/teams";
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
      <p className="versus">{TEAMS[series.team].label} проти</p>
      <Title>{series.opponent}</Title>
      <ul className="pills">
        {pills.map((pill) => (
          <li key={pill}>{pill}</li>
        ))}
      </ul>
      {series.finished ? (
        <>
          <Score series={series} />
          {seriesLengthFact(series) ? <p className="note">{seriesLengthFact(series)}</p> : null}
          <OldAudit series={series} />
        </>
      ) : (
        <>
          <Countdown iso={series.at} />
          <ChancePoints series={series} />
          {series.chain ? <p className="chain">{series.chain}</p> : null}
          {series.winLow != null || series.mapsLow != null ? <p className="disclaimer">{winDisclaimer()}</p> : null}
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
          <span>{TEAMS[series.team].label}</span>
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

export function ChancePoints({ series }: { series: SeriesVM }) {
  if (series.winLow == null || series.winHigh == null) return null;
  const label = TEAMS[series.team].label;
  const wins = pairPercents(series.winLow, series.winHigh);
  const third =
    series.bestOf === 3 && series.mapsLow != null && series.mapsHigh != null
      ? midPercent(series.mapsLow, series.mapsHigh)
      : null;
  return (
    <ul className="chances">
      <li>
        <span>Перемога {label}</span>
        <b>{wins.team}%</b>
      </li>
      <li>
        <span>Перемога {series.opponent}</span>
        <b>{wins.opponent}%</b>
      </li>
      {third != null ? (
        <li>
          <span>3 карти</span>
          <b>{third}%</b>
        </li>
      ) : null}
    </ul>
  );
}

export function seriesLengthFact(series: SeriesVM): string | null {
  if (!series.finished || series.bestOf !== 3) return null;
  if (series.naviScore == null || series.oppScore == null) return null;
  const high = Math.max(series.naviScore, series.oppScore);
  const low = Math.min(series.naviScore, series.oppScore);
  if (high === 2 && low === 1) return "Серія дійшла до третьої карти.";
  if (high === 2 && low === 0) return "Серія закінчилась за дві карти.";
  return null;
}

export function SeriesList({ title, items }: { title: string; items: SeriesVM[] }) {
  if (!items.length) return null;
  return (
    <section className="block">
      <h2>{title}</h2>
      <ul className="rows">
        {items.map((series) => (
          <li key={series.id}>
            <Link href={matchHref(series.team, series.id)}>
              <span className="row-when">{dateBadge(series.at)}</span>
              <span className="row-main">
                <strong>{series.opponent}</strong>
                <em>{series.eventLabel}</em>
              </span>
              <span className={`row-end ${series.finished ? (series.naviWon ? "won" : "lost") : ""}`}>
                {series.finished
                  ? `${series.naviScore ?? "–"}:${series.oppScore ?? "–"}`
                  : series.winLow != null && series.winHigh != null
                    ? `${pairPercents(series.winLow, series.winHigh).team}%`
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

function sideText(low: number, high: number, label: string, opponent: string): string {
  if (low > 50) return `Схилялась до ${label}`;
  if (high < 50) return `Схилялась до ${opponent}`;
  return "Не обрала сторону";
}

export function OldAudit({ series }: { series: SeriesVM }) {
  if (series.oldLow == null || series.oldHigh == null) return null;
  const label = TEAMS[series.team].label;
  const verdict =
    series.oldMiss === true
      ? "Сторону переможця не вгадала."
      : series.oldMiss === false
        ? "Сторону переможця назвала вірно."
        : "Сторону не називала, бо смуга заходила на 50%.";
  const tone = series.oldMiss === true ? "miss" : series.oldMiss === false ? "hit" : "";
  const source =
    series.oldSource === "shown"
      ? "Цю смугу дашборд показував до матчу."
      : series.oldSource === "stored"
        ? "Цю смугу порахували до матчу і зберегли."
        : "Збережена смуга після синку не лишилась. Це повтор тієї самої формули на серіях до матчу.";
  return (
    <div className="audit">
      <p>
        Стара смуга: {bandText(series.oldLow, series.oldHigh)}. {sideText(series.oldLow, series.oldHigh, label, series.opponent)}. Факт: {label}{" "}
        {series.naviScore ?? "–"}:{series.oppScore ?? "–"}. <span className={tone}>{verdict}</span>
      </p>
      <p className="note">{source}</p>
      {series.oldNote ? <p className="note">{series.oldNote}</p> : null}
    </div>
  );
}

export function AuditList({ items }: { items: SeriesVM[] }) {
  const checked = items.filter((item) => item.oldLow != null && item.oldHigh != null);
  if (!checked.length) return null;
  const misses = checked.filter((item) => item.oldMiss === true).length;
  const unnamed = checked.filter((item) => item.oldMiss == null).length;
  return (
    <section className="block">
      <h2>Звірка старої смуги</h2>
      <p>
        Стара смуга не вгадала сторону переможця в {misses} з {checked.length} останніх зіграних серій NAVI.
        {unnamed ? ` Ще ${unnamed} не назвала сторону, бо зайшла на 50%.` : ""}
      </p>
      <ul className="rows">
        {checked.map((series) => (
          <li key={series.id}>
            <Link href={matchHref(series.team, series.id)}>
              <span className="row-when">{dateBadge(series.at)}</span>
              <span className="row-main">
                <strong>{series.opponent}</strong>
                <em>
                  {series.naviScore ?? "–"}:{series.oppScore ?? "–"} · {bandText(series.oldLow ?? 0, series.oldHigh ?? 0)}
                </em>
              </span>
              <span className={`row-end ${series.oldMiss === true ? "lost" : series.oldMiss === false ? "won" : ""}`}>
                {series.oldMiss === true ? "промах" : series.oldMiss === false ? "влучила" : "без сторони"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="note">
        Збережені смуги синк раніше стирав, тож тут повтор старої формули на матчах до серії.
        {checked.some((item) => item.oldNote) ? ` ${checked.find((item) => item.oldNote)?.oldNote}` : ""}
      </p>
    </section>
  );
}

export function Lineup({ title, people }: { title: string; people: SeriesVM["naviPlayers"] }) {
  const showKd = people.some((person) => person.kills != null && person.deaths != null);
  return (
    <section className="block">
      <h2>{title}</h2>
      <ul className="lineup">
        {people.map((person) => {
          const kd =
            person.kills != null && person.deaths != null && person.deaths > 0
              ? (person.kills / person.deaths).toFixed(2)
              : null;
          return (
            <li key={`${person.displayname}-${person.name}`}>
              <b>{person.displayname || person.name}</b>
              {kd ? (
                <span>
                  {kd} K/D · {person.kills}/{person.deaths}
                  {person.adr != null ? ` · ADR ${Math.round(person.adr)}` : ""}
                  {person.rating != null ? ` · рейтинг bo3 ${person.rating.toFixed(2)}` : ""}
                  {person.maps != null ? ` · ${person.maps} карт` : ""}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {showKd ? <p className="note">{MISSING_FIELDS}</p> : <p className="note">Статистику гравців джерело для цієї серії не дало.</p>}
    </section>
  );
}

export function SourceLink({ pageName }: { pageName: string | null }) {
  if (!pageName) return null;
  const external = pageName.startsWith("http");
  return (
    <p className="source-link">
      <a href={external ? pageName : wikiUrl(pageName)}>{external ? "Матч на bo3.gg" : "Сторінка на Liquipedia"}</a>
    </p>
  );
}

export function WhenLine({ iso }: { iso: string }) {
  return <p className="when-line">{berlinLong(iso)}</p>;
}
