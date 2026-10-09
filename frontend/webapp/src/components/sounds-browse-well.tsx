import type { ReactNode } from "react";

/**
 * Rounded inset scroll well for Sounds › Soundscapes / Voices.
 * Warm cream fill matches Create › Start format tray. Top gap is on the
 * content so cards scroll flush to the rim and under the fixed inset shadow.
 */
export function SoundsBrowseWell({ children }: { children: ReactNode }) {
  return (
    <div className="sounds-browse-well relative mt-3.5 min-h-0 flex-1 overflow-hidden rounded-2xl">
      <div className="relative z-[1] h-full min-h-0 overflow-y-auto overscroll-y-contain px-3 pb-24">
        <div className="pt-3">{children}</div>
      </div>
    </div>
  );
}
