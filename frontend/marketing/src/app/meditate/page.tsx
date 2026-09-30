import { ToolMarketingPage } from "@/components/home-v2/tool-marketing-page";

export const metadata = {
  title: "Meditate",
  description:
    "Personalised guided meditations written from your words — goals, journal, and today’s worries — with voices and soundscapes that actually sound good.",
};

export default function MeditatePage() {
  return <ToolMarketingPage tool="meditate" />;
}
