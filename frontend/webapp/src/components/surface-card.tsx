import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/** Shared chrome for interactive/content cards (library, create, pickers). */
export const SURFACE_CARD_CLASS =
  "rounded-xl border border-border bg-card shadow-sm";

type SurfaceCardProps<T extends ElementType = "div"> = {
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function SurfaceCard<T extends ElementType = "div">({
  as,
  className = "",
  children,
  ...rest
}: SurfaceCardProps<T>) {
  const Comp = (as ?? "div") as ElementType;
  return (
    <Comp
      className={`${SURFACE_CARD_CLASS} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Comp>
  );
}
