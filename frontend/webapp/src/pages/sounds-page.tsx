import { MixerSoundsStudio } from "@/components/mixer-sounds-studio";

/**
 * Sounds list + editor share one mounted studio across
 * `/meditate/sounds`, `/new`, `/mix/:id`, and `/preset/:id`
 * so URL changes do not remount or re-fetch (marketing layout pattern).
 * Studio loads factory presets client-side.
 */
export function SoundsPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <MixerSoundsStudio />
    </div>
  );
}
