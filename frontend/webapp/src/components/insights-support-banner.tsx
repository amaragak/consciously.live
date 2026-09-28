import { useCallback, useState } from "react";
import { X } from "lucide-react";
import {
  dismissSoftBanner,
  isSoftBannerDismissed,
} from "@/lib/insight-corrections";
import type { WellbeingLevel } from "@/lib/insight-wellbeing";
import {
  InsightsSupportDialog,
  SupportResourcesFooter,
  SupportResourcesList,
  useSupportCountryState,
} from "@/components/insights-support-dialog";

export type InsightsSupportBannerProps = {
  level: WellbeingLevel;
  rangeKey?: string;
  onOpenSupport?: () => void;
};

export function InsightsSupportBanner({
  level,
  rangeKey,
  onOpenSupport,
}: InsightsSupportBannerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const { country, setCountryCode } = useSupportCountryState();

  const openSupport = useCallback(() => {
    if (onOpenSupport) {
      onOpenSupport();
      return;
    }
    setDialogOpen(true);
  }, [onOpenSupport]);

  if (level === "none") return null;

  if (level === "struggling") {
    if (rangeKey && (dismissed || isSoftBannerDismissed(rangeKey))) return null;

    return (
      <>
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground"
          role="status"
        >
          <span>Going through a lot? Talking to someone can help.</span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={openSupport}
              className="cursor-pointer font-medium text-accent-link underline-offset-2 hover:underline"
            >
              Find support
            </button>
            {rangeKey ? (
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => {
                  dismissSoftBanner(rangeKey);
                  setDismissed(true);
                }}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-accent-soft/40 hover:text-foreground"
              >
                <X className="size-4" aria-hidden strokeWidth={2} />
              </button>
            ) : null}
          </div>
        </div>
        {!onOpenSupport ? (
          <InsightsSupportDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
          />
        ) : null}
      </>
    );
  }

  /* at_risk — full banner, not collapsible */
  return (
    <article
      className="rounded-xl border border-border bg-card px-5 py-5 text-foreground shadow-sm"
      aria-labelledby="insights-support-banner-title"
    >
      <h2
        id="insights-support-banner-title"
        className="font-display text-[1.25rem] font-normal leading-snug text-foreground"
      >
        You don&apos;t have to carry this alone.
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        If you&apos;re thinking about ending your life or you might hurt
        yourself, please reach out now. These services are free and
        confidential.
      </p>
      <div className="mt-4">
        <SupportResourcesList country={country} />
      </div>
      <SupportResourcesFooter
        country={country}
        countryPickerOpen={countryPickerOpen}
        onToggleCountryPicker={() => setCountryPickerOpen((v) => !v)}
        onCountryChange={setCountryCode}
      />
    </article>
  );
}
