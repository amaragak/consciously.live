import { Heart, KeyRound, Leaf, Lock, MessageCircle, Repeat } from "lucide-react";
import type { HealItem } from "@/lib/heal-store";

/** Type glyph for Heal — never a first-letter circle. */
export function HealTypeIcon({
  type,
  size = 14,
}: {
  type: HealItem["type"];
  size?: number;
}) {
  const props = {
    "aria-hidden": true as const,
    strokeWidth: 1.8 as const,
    style: { width: size, height: size },
  };
  if (type === "shame") return <Lock {...props} />;
  if (type === "belief") return <KeyRound {...props} />;
  if (type === "recurring_thought") return <MessageCircle {...props} />;
  if (type === "pattern") return <Repeat {...props} />;
  if (type === "grief" || type === "heartbreak" || type === "resentment") {
    return <Heart {...props} />;
  }
  return <Leaf {...props} />;
}
