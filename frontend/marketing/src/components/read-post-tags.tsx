"use client";

import { useEffect, useState } from "react";
import {
  MEDITATION_TYPE_PILL_CLASS,
  meditationTypePillColors,
  meditationTypePillSurfaceFromDom,
  type MeditationTypePillSurface,
} from "@/lib/meditation-type-pill";

/** Topic chips for public Read — same pill language as library meditation categories. */
export function ReadPostTags({
  tags,
  className = "mt-3",
}: {
  tags: string[];
  className?: string;
}) {
  const [surface, setSurface] = useState<MeditationTypePillSurface>("light");

  useEffect(() => {
    const apply = () => setSurface(meditationTypePillSurfaceFromDom());
    apply();
    const root = document.documentElement;
    const obs = new MutationObserver(apply);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  if (!tags.length) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Tags">
      {tags.map((tag) => {
        const colors = meditationTypePillColors(tag, surface);
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
