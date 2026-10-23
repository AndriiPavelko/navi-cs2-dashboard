import { getPosts } from "@/lib/data";
import { berlinLong } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PulsePage() {
  const posts = await getPosts();
  return (
    <>
      <h1>Пульс</h1>
      <p className="lede">
        Публічні новини navi.gg і Telegram-канали клубу та гравців, які Liquipedia вказує на їхніх сторінках. X і
        Instagram не читаємо: офіційного ключа немає.
      </p>
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
