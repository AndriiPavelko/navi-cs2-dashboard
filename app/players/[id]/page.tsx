import Link from "next/link";
import { notFound } from "next/navigation";
import { SeriesList } from "@/components/series-view";
import { getAllSeries, getPlayers } from "@/lib/data";
import { joinLabel, percent, roleLabel } from "@/lib/format";
import { killDeath, playedIn, seasonStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const players = await getPlayers();
  const player = players.find((item) => item.id === id);
  if (!player) notFound();

  const all = await getAllSeries();
  const team = seasonStats(all);
  const ownSeries = player.isCoach ? all.filter((item) => item.finished) : all.filter((item) => playedIn(player, item));
  const own = seasonStats(ownSeries);
  const kd = killDeath(player, ownSeries);
  const recent = [...ownSeries].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  return (
    <>
      <p className="back">
        <Link href="/players">Усі гравці</Link>
      </p>
      <header className="player-head">
        <p className="badge">{player.isCoach ? "Тренер" : roleLabel(player.role, false)}</p>
        <h1>{player.nickname}</h1>
        {player.realName ? <p className="real">{player.realName}</p> : null}
        <p className="meta">
          {[player.country, joinLabel(player.joinDate)].filter(Boolean).join(" · ")}
        </p>
      </header>
      <section className="block">
        <h2>{player.isCoach ? "Сезон команди, 2026" : "Участь у сезоні 2026"}</h2>
        {player.isCoach ? (
          <p className="note">Liquipedia не ставить тренера в протокол матчу, тож тут рахунок команди за сезон.</p>
        ) : null}
        <dl className="stats">
          <div>
            <dt>Серії</dt>
            <dd>{own.series}</dd>
          </div>
          <div>
            <dt>Перемоги</dt>
            <dd>{own.wins}</dd>
          </div>
          <div>
            <dt>Вінрейт</dt>
            <dd>{own.winRate}</dd>
          </div>
          <div>
            <dt>Карти</dt>
            <dd>
              {own.mapWins}–{own.mapLosses}
            </dd>
          </div>
        </dl>
        {kd.samples > 0 ? (
          <p className="kd">
            K/D {(kd.deaths ? kd.kills / kd.deaths : kd.kills).toFixed(2)} · {kd.kills}/{kd.deaths} за {kd.samples}{" "}
            серій, де джерело дало кіли і смерті
          </p>
        ) : (
          <p className="note">
            K/D немає: Liquipedia не віддала кіли і смерті. Rating 2.0, ADR і KAST не показуємо.
          </p>
        )}
        {!player.isCoach ? (
          <p className="note">
            Команда загалом: {team.wins}–{team.losses}, {percent(team.wins, team.wins + team.losses)}.
          </p>
        ) : null}
        {player.url ? (
          <p className="source-link">
            <a href={player.url}>Профіль на Liquipedia</a>
          </p>
        ) : null}
      </section>
      <SeriesList title={player.isCoach ? "Серії команди" : "Серії з участю"} items={recent} />
    </>
  );
}
