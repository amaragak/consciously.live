import {
  MEDITATION_TYPE_PILL_CLASS,
  meditationTypePillColors,
} from "@/lib/meditation-type-pill";

/** Topic chips for public Read — same pill language as library meditation categories. */
export function ReadPostTags({
  tags,
  className = "mt-3",
}: {
  tags: string[];
  className?: string;
}) {
  if (!tags.length) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Tags">
      {tags.map((tag) => {
        const colors = meditationTypePillColors(tag);
        return (
          <li key={tag.toLowerCase()}>
            <span
              className={MEDITATION_TYPE_PILL_CLASS}
              style={{ backgroundColor: colors.bg, color: colors.fg }}
            >
              {tag}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
