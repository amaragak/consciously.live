"use client";

import { Link } from "@/lib/spa-nav";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { AppBreadcrumbCrumb } from "@/lib/app-nav";

function TrailSeparator() {
  return (
    <span className="mx-2 shrink-0 text-[13px] text-nav-muted" aria-hidden>
      ›
    </span>
  );
}

function TrailEllipsisMenu({
  intermediates,
}: {
  intermediates: AppBreadcrumbCrumb[];
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
      });
    }
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Intermediate steps"
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              transform: "translateX(-50%)",
            }}
            className="z-[200] min-w-[10rem] max-w-[min(100vw-2rem,16rem)] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
          >
            {intermediates.map((c, i) => (
              <div
                key={`mid-${c.label}-${i}`}
                role="none"
                className="px-3 py-2 text-sm"
              >
                {c.href ? (
                  <Link
                    role="menuitem"
                    href={c.href}
                    onClick={() => setOpen(false)}
                    className="block truncate text-nav-crumb underline-offset-2 hover:text-nav-foreground hover:underline focus-visible:underline"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span role="menuitem" className="block truncate text-nav-muted">
                    {c.label}
                  </span>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Show intermediate breadcrumb steps"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-6 min-w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[color:var(--header-border)] bg-transparent px-1.5 text-sm leading-none text-nav-muted transition-colors hover:text-nav-foreground"
      >
        …
      </button>
      {menu}
    </>
  );
}

function TrailCrumb({
  crumb,
  current,
}: {
  crumb: AppBreadcrumbCrumb;
  current: boolean;
}) {
  if (current || !crumb.href) {
    return (
      <span
        className={
          current
            ? "app-header-crumb-current min-w-0 max-w-[240px] truncate font-semibold"
            : "shrink-0 text-nav-muted"
        }
        {...(current ? { "aria-current": "page" as const } : {})}
        title={current ? crumb.label : undefined}
      >
        {crumb.label}
      </span>
    );
  }
  return (
    <Link
      href={crumb.href}
      className="shrink-0 text-nav-crumb underline-offset-2 hover:text-nav-foreground hover:underline focus-visible:underline"
    >
      {crumb.label}
    </Link>
  );
}

/**
 * Desktop header trail after the brand phrase.
 * Collapses middle levels into a "…" menu when space is tight.
 * First level + last two always remain visible when collapsed.
 */
export function AppBreadcrumb({
  crumbs,
  className,
}: {
  crumbs: AppBreadcrumbCrumb[];
  className?: string;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  const measureRef = useRef<HTMLOListElement | null>(null);
  const [collapseMiddle, setCollapseMiddle] = useState(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure || crumbs.length <= 3) {
      setCollapseMiddle(false);
      return;
    }

    const check = () => {
      // Measure the full trail (hidden) against the visible nav width.
      const fullWidth = measure.scrollWidth;
      const available = nav.clientWidth;
      setCollapseMiddle(fullWidth > available + 1);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(nav);
    if (nav.parentElement) ro.observe(nav.parentElement);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [crumbs]);

  if (crumbs.length === 0) return null;

  const collapsed = collapseMiddle && crumbs.length > 3;
  const intermediates = collapsed ? crumbs.slice(1, -2) : [];
  const visible: Array<
    | { kind: "crumb"; crumb: AppBreadcrumbCrumb; index: number }
    | { kind: "ellipsis"; key: string }
  > = collapsed
    ? [
        { kind: "crumb", crumb: crumbs[0]!, index: 0 },
        { kind: "ellipsis", key: "ellipsis" },
        ...crumbs.slice(-2).map((crumb, i) => ({
          kind: "crumb" as const,
          crumb,
          index: crumbs.length - 2 + i,
        })),
      ]
    : crumbs.map((crumb, index) => ({ kind: "crumb" as const, crumb, index }));

  return (
    <nav
      ref={navRef}
      aria-label="Breadcrumb"
      className={`relative min-w-0 overflow-hidden font-ui text-sm ${className ?? ""}`}
    >
      {/* Off-screen full trail for overflow measurement */}
      <ol
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 -z-10 flex list-none items-center whitespace-nowrap opacity-0"
      >
        {crumbs.map((c, i) => (
          <li key={`m-${c.label}-${i}`} className="flex items-center">
            {i > 0 ? <TrailSeparator /> : null}
            <span
              className={
                i === crumbs.length - 1
                  ? "max-w-[240px] truncate font-semibold"
                  : undefined
              }
            >
              {c.label}
            </span>
          </li>
        ))}
      </ol>
      <ol className="m-0 flex list-none items-center p-0">
        {visible.map((item, i) => {
          if (item.kind === "ellipsis") {
            return (
              <li key={item.key} className="flex items-center">
                {i > 0 ? <TrailSeparator /> : null}
                <TrailEllipsisMenu intermediates={intermediates} />
              </li>
            );
          }
          const last = item.index === crumbs.length - 1;
          return (
            <li key={`${item.crumb.label}-${item.index}`} className="flex min-w-0 items-center">
              {i > 0 ? <TrailSeparator /> : null}
              <TrailCrumb crumb={item.crumb} current={last} />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Mobile back link to the parent trail level. */
export function AppBreadcrumbBack({
  parent,
}: {
  parent: AppBreadcrumbCrumb | null;
}) {
  if (!parent?.href && !parent?.label) return null;
  const label = parent.label;
  const inner: ReactNode = (
    <>
      <span aria-hidden className="text-[15px] leading-none">
        ‹
      </span>
      <span className="truncate">{label}</span>
    </>
  );
  const className =
    "inline-flex max-w-[40vw] items-center gap-1 font-ui text-sm text-nav-crumb underline-offset-2 hover:text-nav-foreground hover:underline focus-visible:underline";
  if (parent.href) {
    return (
      <Link href={parent.href} className={className} aria-label={`Back to ${label}`}>
        {inner}
      </Link>
    );
  }
  return <span className={className}>{inner}</span>;
}
