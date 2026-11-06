"use client";

import { useEffect, useState } from "react";
import {
  fetchJournalVoiceUsage,
  type JournalVoiceUsage,
} from "@/lib/medimade-api";
import { willUseServerVoiceFallback } from "@/lib/journal-on-device-speech";

type Props = {
  /** Force-show even before capability probe (e.g. while recording in fallback). */
  forceShow?: boolean;
  className?: string;
  compact?: boolean;
};

export function JournalVoiceAllowanceBar({
  forceShow = false,
  className = "",
  compact = false,
}: Props) {
  const [usage, setUsage] = useState<JournalVoiceUsage | null>(null);
  const [show, setShow] = useState(forceShow);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const needsServer = forceShow || (await willUseServerVoiceFallback());
      if (cancelled) return;
      setShow(needsServer);
      if (!needsServer) return;
      const u = await fetchJournalVoiceUsage();
      if (!cancelled) setUsage(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [forceShow]);

  if (!show || !usage) return null;
  const pctLeft =
    usage.allowanceMinutes > 0
      ? Math.max(0, Math.min(1, usage.remainingMinutes / usage.allowanceMinutes))
      : 0;
  const low = pctLeft < 0.2;
  const left = Math.max(0, Math.round(usage.remainingMinutes));
  const total = Math.round(usage.allowanceMinutes);

  return (
    <div className={className}>
      <div
        className={`flex items-center justify-between gap-3 ${
          compact ? "text-[11px]" : "text-[12px]"
        } text-muted`}
      >
        <span>Voice this month</span>
        <span className="tabular-nums">
          {left} of {total} min left
        </span>
      </div>
      <div
        className={`mt-1.5 h-1 overflow-hidden rounded-full bg-border ${
          compact ? "" : ""
        }`}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${pctLeft * 100}%`,
            backgroundColor: low ? "var(--accent, #C8A46A)" : "#C8A46A",
          }}
        />
      </div>
    </div>
  );
}
