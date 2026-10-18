import { healPhotoUrl, type HealItem, type HealStoreV1 } from "@/lib/heal-store";

/** Inline name chip. Sizes with the surrounding text. */
export function HealNameChip({
  item,
  store,
}: {
  item: HealItem;
  store: HealStoreV1;
}) {
  const photo = healPhotoUrl(store, item);
  const letter = item.title.trim().slice(0, 1).toUpperCase() || "•";
  return (
    <span className="inline-flex items-center gap-[0.28em] rounded-full border border-heal-border bg-card py-[0.05em] pl-[0.12em] pr-[0.5em] align-baseline font-semibold text-foreground">
      <span className="inline-flex h-[1.15em] w-[1.15em] items-center justify-center overflow-hidden rounded-full bg-heal-tint text-[0.72em] font-semibold text-heal-accent">
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          letter
        )}
      </span>
      {item.title.trim() || "Untitled"}
    </span>
  );
}
