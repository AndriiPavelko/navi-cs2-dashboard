import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditList, Lineup, MapList, SeriesHero, SeriesList, SourceLink, WhenLine } from "@/components/series-view";
import { MISSING_FIELDS } from "@/lib/chance";
import { getAllSeries, getPlayers, getPosts } from "@/lib/data";
import { berlinLong, joinLabel, percent, roleLabel } from "@/lib/format";
import { killDeath, playedIn, seasonStats } from "@/lib/stats";
import { playerHref, teamHref, TEAMS, type TeamId } from "@/lib/teams";

export async function HomeScreen({ team }: { team: TeamId }) {
  const profile = TEAMS[team];
  const series = await getAllSeries(team);
  const upcoming = series.filter((item) => !item.finished).sort((a, b) => a.at.localeCompare(b.at));
  const finished = series.filter((item) => item.finished).sort((a, b) => b.at.localeCompare(a.at));
  const next = upcoming[0] ?? finished[0] ?? null;
  const stats = seasonStats(series);
  const later = upcoming.slice(next && !next.finished ? 1 : 0);
  const recent = finished.slice(0, 5);

  return (
    <>
      <h1 className="hello">{profile.hello}</h1>
      <p className="hello-sub">{profile.season}</p>
      {next ? (
        <SeriesHero series={next} />
      ) : (
        <section className="hero empty-hero">
          <h2>Розклад ще порожній</h2>
          <p>Натисни «Оновити», щоб забрати сезон з bo3.gg.</p>
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
          Вінрейт серій {percent(stats.wins, stats.wins + stats.losses)}. Карти рахуються лише там, де bo3.gg дало
          переможця.
        </p>
      </section>
      {team === "navi" ? <AuditList items={finished.slice(0, 10)} /> : null}
      <SeriesList title={later.length ? "Далі в розкладі" : "Останні серії"} items={later.length ? later : recent} />
    </>
  );
}

export async function MatchesScreen({ team }: { team: TeamId }) {
  const profile = TEAMS[team];
  const series = await getAllSeries(team);
  const upcoming = series.filter((item) => !item.finished).sort((a, b) => a.at.localeCompare(b.at));
  const finished = series.filter((item) => item.finished).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <h1>Матчі</h1>
      <p className="lede">Усі серії {profile.label} CS2 з 1 січня 2026. Час — за Берліном.</p>
      {upcoming.length ? <SeriesList title="Далі" items={upcoming} /> : <p className="note">Майбутніх серій у джерелі зараз немає.</p>}
      <SeriesList title="Зіграні" items={finished} />
      {!series.length ? <p className="note">Після синку тут з’являться матчі сезону.</p> : null}
    </>
  );
}

export async function MatchScreen({ team, id }: { team: TeamId; id: string }) {
  const profile = TEAMS[team];
  const series = (await getAllSeries(team)).find((item) => item.id === id);
  if (!series) notFound();

  return (
    <>
      <p className="back">
        <Link href={teamHref(team, "/matches")}>Усі матчі</Link>
      </p>
      <SeriesHero series={series} heading="h1" />
      <WhenLine iso={series.at} />
      <section className="block">
        <h2>Карти</h2>
        <MapList series={series} />
      </section>
      {series.naviPlayers.length ? <Lineup title={`Склад ${profile.label}`} people={series.naviPlayers} /> : null}
      {series.oppPlayers.length ? <Lineup title={`Склад ${series.opponent}`} people={series.oppPlayers} /> : null}
      <SourceLink pageName={series.pageName} />
    </>
  );
}

export async function PlayersScreen({ team }: { team: TeamId }) {
  const players = await getPlayers(team);
  return (
    <>
      <h1>Гравці</h1>
      <p className="lede">Активний склад CS2 з bo3.gg. KAST джерело не віддає, HLTV Rating не вигадуємо.</p>
      {players.length ? (
        <ul className="roster">
          {players.map((player) => (
            <li key={player.id}>
              <Link href={playerHref(team, player.id)}>
                <span className="nick">
                  {player.nickname}
                  {player.isCoach ? <i>тренер</i> : null}
                </span>
                <span className="meta">
                  {roleLabel(player.role, player.isCoach)}
                  {player.country ? ` · ${player.country}` : ""}
                </span>
                {joinLabel(player.joinDate) ? <span className="meta">{joinLabel(player.joinDate)}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="note">Склад з’явиться після оновлення.</p>
      )}
    </>
  );
}

export async function PlayerScreen({ team, id }: { team: TeamId; id: string }) {
  const players = await getPlayers(team);
  const player = players.find((item) => item.id === id);
  if (!player) notFound();

  const all = await getAllSeries(team);
  const season = seasonStats(all);
  const ownSeries = player.isCoach ? all.filter((item) => item.finished) : all.filter((item) => playedIn(player, item));
  const own = seasonStats(ownSeries);
  const kd = killDeath(player, ownSeries);
  const recent = [...ownSeries].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  return (
    <>
      <p className="back">
        <Link href={teamHref(team, "/players")}>Усі гравці</Link>
      </p>
      <header className="player-head">
        <p className="badge">{player.isCoach ? "Тренер" : roleLabel(player.role, false)}</p>
        <h1>{player.nickname}</h1>
        {player.realName ? <p className="real">{player.realName}</p> : null}
        <p className="meta">{[player.country, joinLabel(player.joinDate)].filter(Boolean).join(" · ")}</p>
      </header>
      <section className="block">
        <h2>{player.isCoach ? "Сезон команди, 2026" : "Участь у сезоні 2026"}</h2>
        {player.isCoach ? (
          <p className="note">Тренеру bo3.gg не віддає кіли і смерті, тож тут рахунок команди за сезон.</p>
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
        {player.kills != null && player.deaths != null && !player.isCoach ? (
          <p className="kd">
            K/D {(player.deaths ? player.kills / player.deaths : player.kills).toFixed(2)} · {player.kills}/{player.deaths}
            {player.adr != null ? ` · ADR ${Math.round(player.adr)}` : ""}
            {player.rating != null ? ` · рейтинг bo3 ${player.rating.toFixed(2)}` : ""}
            {player.mapsPlayed != null ? ` · ${player.mapsPlayed} карт` : ""}
          </p>
        ) : kd.samples > 0 ? (
          <p className="kd">
            K/D {(kd.deaths ? kd.kills / kd.deaths : kd.kills).toFixed(2)} · {kd.kills}/{kd.deaths} за {kd.samples} серій
          </p>
        ) : (
          <p className="note">Кілів і смертей за вікно джерело не дало.</p>
        )}
        {!player.isCoach ? <p className="note">{MISSING_FIELDS}</p> : null}
        {!player.isCoach ? (
          <p className="note">
            Команда загалом: {season.wins}–{season.losses}, {percent(season.wins, season.wins + season.losses)}.
          </p>
        ) : null}
        {player.url ? (
          <p className="source-link">
            <a href={player.url}>{player.url.includes("bo3.gg") ? "Профіль на bo3.gg" : "Профіль на Liquipedia"}</a>
          </p>
        ) : null}
      </section>
      <SeriesList title={player.isCoach ? "Серії команди" : "Серії з участю"} items={recent} />
    </>
  );
}

export async function PulseScreen({ team }: { team: TeamId }) {
  const posts = await getPosts(team);
  const lede =
    team === "navi"
      ? "Публічні новини navi.gg і Telegram-канали клубу та гравців, які Liquipedia вказує на їхніх сторінках. X і Instagram не читаємо: офіційного ключа немає."
      : "Публічні Telegram-канали клубу та гравців, які Liquipedia вказує на їхніх сторінках. X і Instagram не читаємо: офіційного ключа немає.";
  return (
    <>
      <h1>Пульс</h1>
      <p className="lede">{lede}</p>
      <ul className="tones" aria-label="Позначки тону">
        <li data-tone="спокійно">спокійно</li>
        <li data-tone="зібрано">зібрано</li>
        <li data-tone="напружено">напружено</li>
      </ul>
      <p className="note">Тон допису за словником. Це не висновок про стан людини.</p>
      {posts.length ? (
        <ul className="feed">
          {posts.map((post) => {
            const title = (post.title || "").trim();
            const body = (post.body || "").trim();
            const bodyRepeatsTitle = Boolean(title) && body.startsWith(title.slice(0, 80));
            return (
              <li key={post.id}>
                <article>
                  <div className="feed-top">
                    <span data-tone={post.tone}>{post.tone}</span>
                    <span className="src">{post.source === "telegram" ? "Telegram" : "navi.gg"}</span>
                  </div>
                  {bodyRepeatsTitle ? (
                    <p>{body}</p>
                  ) : (
                    <>
                      {title ? <h2>{title}</h2> : null}
                      {body ? <p>{body}</p> : null}
                    </>
                  )}
                  <p className="feed-meta">
                    <span>{post.author}</span>
                    {post.publishedAt ? <time dateTime={post.publishedAt}>{berlinLong(post.publishedAt)}</time> : null}
                  </p>
                  <a href={post.url} target="_blank" rel="noreferrer">
                    Відкрити допис
                  </a>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="note">Після оновлення тут будуть дописи.</p>
      )}
    </>
  );
}
