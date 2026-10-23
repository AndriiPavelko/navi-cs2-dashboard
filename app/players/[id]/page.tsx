import { PlayerScreen } from "@/components/screens";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlayerScreen team="navi" id={id} />;
}
