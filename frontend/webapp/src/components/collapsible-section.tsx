import type { ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  eyebrow: string;
  summary: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Full-bleed band sections — no top hairline; rhythm comes from band colour. */
  variant?: "default" | "band";
  /**
   * Keep section chrome; force open and mark busy.
   * Prefer the same section component so layout stays aligned when chrome changes.
   */
  loading?: boolean;
  /**
   * When false, section stays expanded and the header is not interactive
   * (e.g. pending content or a lone “Add …” CTA).
   */
  collapsible?: boolean;
  /** Inline control beside the eyebrow (e.g. letter play). */
  headerEnd?: ReactNode;
};

/**
 * Expandable section chrome: header-row toggle, inline collapsed preview,
 * height-only content animation. Used on Manifest and Journal Insights.
 */
export function CollapsibleSection({
  eyebrow,
  summary,
  collapsed,
  onToggle,
  children,
  variant = "default",
  loading = false,
  collapsible = true,
  headerEnd,
}: Props) {
  const band = variant === "band";
  const canToggle = collapsible && !loading;
  const isCollapsed = canToggle ? collapsed : false;

  return (
    <section
      className={`${band ? "pt-6" : "border-t border-border pt-8"}`}
      aria-busy={loading || undefined}
    >
      <div
        className={`group flex w-full items-center gap-3 ${
          isCollapsed ? (band ? "pb-6" : "pb-8") : "pb-2"
        }`}
      >
        <p className="shrink-0 font-sans text-[15px] font-medium uppercase tracking-[0.08em] text-muted">
          {eyebrow}
        </p>
        {headerEnd ? <span className="shrink-0">{headerEnd}</span> : null}
        <button
          type="button"
          onClick={canToggle ? onToggle : undefined}
          disabled={!canToggle}
          aria-expanded={!isCollapsed}
          className={`flex min-w-0 flex-1 items-center gap-4 text-left ${
            canToggle ? "cursor-pointer" : "cursor-default"
          }`}
        >
          {isCollapsed ? (
            loading ? (
              <Skeleton className="h-3.5 w-40 max-w-[320px]" />
            ) : (
              <span className="max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[14px] font-normal italic text-muted/50">
                {summary}
              </span>
            )
          ) : (
            <span className="min-h-[1em] flex-1" aria-hidden />
          )}
          <IconChevronDown
            size={18}
            stroke={2}
            aria-hidden
            className={`ml-auto shrink-0 text-muted transition-transform duration-200 ease-[ease] ${
              isCollapsed ? "" : "rotate-180"
            } ${canToggle ? "" : "opacity-40"}`}
          />
        </button>
      </div>

      {/* Hairline only when collapsed — default stack only (bands use colour). */}
      {isCollapsed && !band ? (
        <div
          aria-hidden
          className="-mb-px border-b border-border transition-[border-color] duration-200 ease-[ease] group-hover:border-gold"
        />
      ) : null}

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-[ease]"
        style={{ gridTemplateRows: isCollapsed ? "0fr" : "1fr" }}
      >
        <div
          className={`min-h-0 ${isCollapsed ? "overflow-hidden" : "overflow-visible"}`}
        >
          <div className={isCollapsed ? "" : band ? "pb-7 pt-4" : "pb-8 pt-4"}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
