import Link from "next/link";
import { getPlayers } from "@/lib/data";
import { joinLabel, roleLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const players = await getPlayers();
  return (
    <>
      <h1>Гравці</h1>
      <p className="lede">Активний склад CS2 з Liquipedia. Якщо джерело змінить ростер, наступний синк теж змінить його.</p>
      {players.length ? (
        <ul className="roster">
          {players.map((player) => (
            <li key={player.id}>
              <Link href={`/players/${encodeURIComponent(player.id)}`}>
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
