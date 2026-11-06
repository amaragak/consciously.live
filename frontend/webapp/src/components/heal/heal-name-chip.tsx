import { HealTypeIcon } from "@/components/heal/heal-type-icon";
import { healPhotoUrl, type HealItem, type HealStoreV1 } from "@/lib/heal-store";

/** Inline name chip. Sizes with the surrounding text. Never uses a letter avatar. */
export function HealNameChip({
  item,
  store,
}: {
  item: HealItem;
  store: HealStoreV1;
}) {
  const photo = healPhotoUrl(store, item);
  return (
    <span className="inline-flex items-center gap-[0.28em] rounded-full border border-heal-border bg-card py-[0.05em] pl-[0.12em] pr-[0.5em] align-baseline font-semibold text-foreground">
      <span className="inline-flex h-[1.15em] w-[1.15em] items-center justify-center overflow-hidden rounded-full bg-heal-tint text-heal-accent">
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <HealTypeIcon type={item.type} size={11} />
        )}
      </span>
      {item.title.trim() || "Untitled"}
    </span>
  );
}
