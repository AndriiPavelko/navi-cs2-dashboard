import { getDigest } from "@/lib/data";
import type { TeamId } from "@/lib/teams";
import { berlinLong } from "@/lib/format";

export async function TeamDigest({ team }: { team: TeamId }) {
  const digest = await getDigest(team);
  if (!digest) return <p className="note">Зведення з джерелами з’явиться після першого успішного оновлення.</p>;
  return <section className="block digest">
    <h2>{digest.mode === "ai" ? "AI-зведення · відібрані факти" : "Фактичне зведення"}</h2>
    <p className="note">Складено {berlinLong(digest.generatedAt)}. Свіжість джерел перевіряй за часом біля кожного факту.</p>
    {digest.warning ? <p className="note">{digest.warning}</p> : null}
    <ul>{digest.items.map((item) => <li key={item.id}>
      <p>{item.text}</p>
      {item.sources.map((source) => <small key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> · перевірено {berlinLong(source.checkedAt)}</small>)}
    </li>)}</ul>
  </section>;
}
