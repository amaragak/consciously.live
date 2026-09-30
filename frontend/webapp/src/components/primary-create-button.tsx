import type {
  ButtonHTMLAttributes,
  CSSProperties,
  MouseEventHandler,
  ReactNode,
} from "react";
import { Link } from "react-router-dom";

export type PrimaryCreateButtonVariant = "regular" | "compact";

/** Fill treatment. Size/shape still come from `variant`. */
export type PrimaryCreateButtonTone = "accent" | "gold" | "outline";

const VARIANT_CLASS: Record<PrimaryCreateButtonVariant, string> = {
  regular:
    "inline-flex cursor-pointer items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold shadow-[0_2px_8px_rgb(15_27_45_/_0.14)] disabled:cursor-not-allowed disabled:opacity-50",
  compact:
    "inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-sm font-bold shadow-[0_2px_8px_rgb(15_27_45_/_0.14)] disabled:cursor-not-allowed disabled:opacity-50",
};

const TONE_CLASS: Record<PrimaryCreateButtonTone, string> = {
  accent:
    "accent-fill-gradient text-on-accent transition-opacity hover:opacity-90",
  gold: "bg-gold text-on-accent transition-opacity hover:opacity-90",
  outline:
    "border border-border bg-card text-foreground transition-colors hover:border-accent/40",
};

/** Shared mist fill for accent tone (also usable on custom-shaped controls). */
export const PRIMARY_ACCENT_FILL_STYLE: CSSProperties = {
  backgroundColor: "var(--accent-button)",
  backgroundImage: "var(--accent-gradient-button)",
};

type SharedProps = {
  variant?: PrimaryCreateButtonVariant;
  tone?: PrimaryCreateButtonTone;
  /**
   * Label after the automatic "+ ". Compact ignores this and shows "+" only,
   * unless `leadingPlus` is false (then `children` render as-is).
   */
  children?: ReactNode;
  /** When false, skip the leading "+" and render `children` only. */
  leadingPlus?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

type ButtonProps = SharedProps &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "className" | "aria-label" | "style"
  > & {
    to?: undefined;
  };

type LinkProps = SharedProps & {
  to: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export type PrimaryCreateButtonProps = ButtonProps | LinkProps;

function joinClass(
  variant: PrimaryCreateButtonVariant,
  tone: PrimaryCreateButtonTone,
  className?: string,
) {
  const base = `${VARIANT_CLASS[variant]} ${TONE_CLASS[tone]}`;
  return className ? `${base} ${className}` : base;
}

function labelContent(
  variant: PrimaryCreateButtonVariant,
  children: ReactNode,
  leadingPlus: boolean,
) {
  if (!leadingPlus) return children ?? null;
  if (variant === "compact") return "+";
  if (children == null || children === false || children === "") return "+";
  return <>+ {children}</>;
}

/**
 * Primary creation CTA: leading "+" with shared size/shape.
 * Canonical look matches Journal sidebar “+ New entry” / collapsed “+”.
 * Use `tone` for dashboard/marketing fills (gold, outline) without changing shape.
 */
export function PrimaryCreateButton(props: PrimaryCreateButtonProps) {
  const variant = props.variant ?? "regular";
  const tone = props.tone ?? "accent";
  const leadingPlus = props.leadingPlus !== false;
  const classes = joinClass(variant, tone, props.className);
  const content = labelContent(variant, props.children, leadingPlus);
  const gradientStyle: CSSProperties =
    tone === "accent" ? PRIMARY_ACCENT_FILL_STYLE : {};
  const style = { ...gradientStyle, ...props.style };

  if (props.to != null) {
    return (
      <Link
        to={props.to}
        className={classes}
        style={style}
        aria-label={props["aria-label"]}
        onClick={props.onClick}
      >
        {content}
      </Link>
    );
  }

  const {
    type = "button",
    variant: _variant,
    tone: _tone,
    leadingPlus: _leadingPlus,
    children: _children,
    className: _className,
    to: _to,
    style: _style,
    ...buttonRest
  } = props;

  return (
    <button type={type} className={classes} style={style} {...buttonRest}>
      {content}
    </button>
  );
}
