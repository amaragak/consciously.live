import { useState } from "react";
import { InsightsSupportDialog } from "@/components/insights-support-dialog";

type Props = {
  className?: string;
};

export function InsightsNeedSupportLink({ className = "" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`cursor-pointer text-sm text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline ${className}`.trim()}
      >
        Need support?
      </button>
      <InsightsSupportDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
