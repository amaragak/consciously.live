import * as Tooltip from "@radix-ui/react-tooltip";
import { DRUMS_LOCKED_FOR_MELODIC_HINT } from "@/lib/sound-taxonomy";

/**
 * Keep a stable Tooltip tree whether locked or not so the drums strip (select +
 * fader) does not remount when melodic lock toggles between factory presets.
 */
export function DrumsLockedWrap({
  locked,
  className,
  children,
}: {
  locked: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip.Provider delayDuration={200} disableHoverableContent>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div
            className={className}
            aria-disabled={locked || undefined}
          >
            {children}
          </div>
        </Tooltip.Trigger>
        {locked ? (
          <Tooltip.Portal>
            <Tooltip.Content
              side="top"
              align="center"
              sideOffset={8}
              className="z-[120] max-w-[16rem] rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground shadow-md"
            >
              {DRUMS_LOCKED_FOR_MELODIC_HINT}
              <Tooltip.Arrow className="fill-card stroke-border" />
            </Tooltip.Content>
          </Tooltip.Portal>
        ) : null}
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
