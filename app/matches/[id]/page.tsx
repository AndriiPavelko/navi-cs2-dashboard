import { MatchScreen } from "@/components/screens";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchScreen team="navi" id={id} />;
}
