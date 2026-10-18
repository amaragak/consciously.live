import { useParams } from "react-router-dom";
import { HealHome, HealRested } from "@/components/heal/heal-home";
import { HealItemView } from "@/components/heal/heal-item-view";
import { HealLetterView } from "@/components/heal/heal-letter-view";
import { HealSupportView } from "@/components/heal/heal-support-view";

export function HealHomePage() {
  return <HealHome />;
}

export function HealRestedPage() {
  return <HealRested />;
}

export function HealSupportPage() {
  return <HealSupportView />;
}

export function HealItemPage() {
  const { itemId = "" } = useParams();
  return <HealItemView itemId={decodeURIComponent(itemId)} />;
}

export function HealLetterPage() {
  const { itemId = "", entryId } = useParams();
  return (
    <HealLetterView
      itemId={decodeURIComponent(itemId)}
      entryId={entryId ? decodeURIComponent(entryId) : undefined}
    />
  );
}
