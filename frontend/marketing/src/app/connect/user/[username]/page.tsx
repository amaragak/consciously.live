import { ConnectUserProfileView } from "@/components/connect-user-profile-view";

type Props = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  const label = username.trim() || "Member";
  return {
    title: `${label} · Connect`,
    description: `Public Connect profile for ${label}.`,
  };
}

export default function ConnectUserPage() {
  return <ConnectUserProfileView />;
}
