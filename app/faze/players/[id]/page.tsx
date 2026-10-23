import { PlayerScreen } from "@/components/screens";

export const dynamic = "force-dynamic";

export default async function FazePlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlayerScreen team="faze" id={id} />;
}
