import type { ReactNode, Ref } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus, SquarePen } from "lucide-react";

/** Light accent from the gold accent token (rules, dashed outlines, hero eyebrow). */
export const LIGHT_ACCENT_BORDER =
  "border-[color-mix(in_srgb,var(--gold)_70%,white)]";
export const LIGHT_ACCENT_TEXT =
  "text-[color-mix(in_srgb,var(--gold)_50%,white)]";

/** Shared look of the small "label" eyebrow ("My manifesto", "This month"…). */
export const MANIFESTO_EYEBROW_CLASS =
  "text-[11px] font-semibold uppercase tracking-[1.8px]";

/**
 * Edit / "+ Add …" reveal: hidden until the band is hovered or has focus
 * inside; always shown on touch. Stay in the tab order (`focus-within`).
 */
export const BAND_REVEAL_CLASS =
  "opacity-0 transition-opacity duration-150 group-hover/band:opacity-100 group-focus-within/band:opacity-100 [@media(hover:none)]:opacity-100";

/** Section title row: serif title + subline on the left, optional control on the right. */
export function ManifestoSectionHeader({
  id,
  title,
  subline,
  right,
}: {
  id?: string;
  title: string;
  subline: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2
          id={id}
          className="font-display text-2xl font-normal leading-[1.15] text-foreground md:text-[30px]"
        >
          {title}
        </h2>
        <p className="text-[15px] text-foreground/75">{subline}</p>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

const LINK_ROW_CLASS =
  "inline-flex cursor-pointer items-center gap-0.5 text-sm font-semibold text-accent-link transition-opacity hover:opacity-80";

/** "All guides ›" style link in a section header. */
export function ManifestoHeaderLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={LINK_ROW_CLASS}>
      {children}
      <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
    </Link>
  );
}

/** "+ Add life area" style header action. */
export function ManifestoHeaderAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-accent-link transition-opacity hover:opacity-80"
    >
      <Plus aria-hidden className="size-3.5" strokeWidth={2} />
      {children}
    </button>
  );
}

/** Outline "Edit" pill for Values / Quotes / Questions. */
export function ManifestoEditPill({
  onClick,
  active,
  label,
  alwaysVisible = false,
}: {
  onClick: () => void;
  /** Manage mode on: the pill reads "Done". */
  active: boolean;
  label: string;
  alwaysVisible?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? `Finish editing ${label}` : `Edit ${label}`}
      className={`inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-[opacity,border-color] duration-150 hover:border-accent/50 ${
        alwaysVisible ? "" : BAND_REVEAL_CLASS
      }`}
    >
      {active ? null : (
        <SquarePen aria-hidden className="size-[13px]" strokeWidth={1.75} />
      )}
      {active ? "Done" : "Edit"}
    </button>
  );
}

/** "+ Add a value" last grid cell. Always visible on touch and when the list is empty. */
export function ManifestoAddItem({
  onClick,
  children,
  empty = false,
  indentClassName = "",
  buttonRef,
}: {
  onClick: () => void;
  children: ReactNode;
  /** List is empty: stay visible on every device. */
  empty?: boolean;
  /** Lines the item up with the list text (e.g. past the number column). */
  indentClassName?: string;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={`inline-flex w-fit cursor-pointer items-center gap-1 text-sm font-semibold text-accent-link transition-opacity duration-150 hover:opacity-80 ${indentClassName} ${
        empty ? "" : BAND_REVEAL_CLASS
      }`}
    >
      <Plus aria-hidden className="size-3.5" strokeWidth={2} />
      {children}
    </button>
  );
}
