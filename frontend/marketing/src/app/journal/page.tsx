import { ToolMarketingPage } from "@/components/home-v2/tool-marketing-page";

export const metadata = {
  title: "Journal",
  description:
    "A private journal for writing or speaking freely — with patterns over time, gratitudes, and a path into a meditation when you want to go deeper.",
};

export default function JournalPage() {
  return <ToolMarketingPage tool="journal" />;
}
