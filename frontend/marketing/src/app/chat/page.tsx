import { ToolMarketingPage } from "@/components/home-v2/tool-marketing-page";

export const metadata = {
  title: "Chat",
  description:
    "A coach that listens, reflects, and acts — log wins, add steps, or start a meditation from the same conversation.",
};

export default function ChatMarketingPage() {
  return <ToolMarketingPage tool="chat" />;
}
