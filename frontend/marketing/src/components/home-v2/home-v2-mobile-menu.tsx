"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  HOME_V2_START_FREE_HREF,
  type HomeV2ToolId,
} from "@/components/home-v2/constants";

const TOOL_BLURBS: Record<string, string> = {
  meditate: "Meditations made from your life",
  journal: "Write or speak, see the patterns",
  manifest: "Vision board, manifesto, goals",
  focus: "A timer for your goals",
  chat: "A coach that acts",
};

type NavItem = {
  id: string;
  label: string;
  href: string;
  onClick?: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  toolLinks: readonly NavItem[];
  secondaryLinks: readonly NavItem[];
  activeTool?: HomeV2ToolId | null;
  activeSecondary?: string | null;
  triggerId: string;
  panelId: string;
};

/**
 * Left slide-in drawer under the real site header (no duplicate chrome).
 * Stays mounted off-screen when closed so CSS can animate the slide.
 */
export function HomeV2MobileMenu({
  open,
  onClose,
  toolLinks,
  secondaryLinks,
  activeTool = null,
  activeSecondary = null,
  triggerId,
  panelId,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Scroll lock + move focus into the panel while open
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const main = document.querySelector("main");
    const scrollRoot =
      main instanceof HTMLElement &&
      /(auto|scroll)/.test(getComputedStyle(main).overflowY)
        ? main
        : document.body;
    const prevOverflow = scrollRoot.style.overflow;
    scrollRoot.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      first?.focus();
    }, 40);

    return () => {
      window.clearTimeout(focusTimer);
      scrollRoot.style.overflow = prevOverflow;
      const el =
        previouslyFocused.current ??
        (document.getElementById(triggerId) as HTMLElement | null);
      el?.focus?.();
    };
  }, [open, triggerId]);

  // Escape + close when crossing md
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 768px)").matches) onClose();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, onClose]);

  // Tab trap inside the panel (header hamburger stays clickable above)
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!mounted) return null;

  const closeWithNav = (extra?: () => void) => {
    onClose();
    extra?.();
  };

  return createPortal(
    <div
      className={`home-v2 home-v2-mobile-menu md:hidden${open ? " is-open" : ""}`}
      role="presentation"
      aria-hidden={!open}
    >
      <button
        type="button"
        className="home-v2-mobile-menu-scrim"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label="Menu"
        className="home-v2-mobile-menu-panel"
        inert={!open ? true : undefined}
      >
        <nav aria-label="Main" className="home-v2-mobile-menu-nav">
          <div className="flex flex-col">
            {toolLinks.map((t) => {
              const active = activeTool === t.id;
              const blurb = TOOL_BLURBS[t.id] ?? "";
              const className =
                "box-border flex min-h-[52px] flex-col gap-0.5 py-2.5";
              const label = (
                <>
                  <span
                    className={`home-v2-display text-[22px] leading-[1.15] ${
                      active
                        ? "italic text-[var(--hv2-gold)]"
                        : "text-[var(--hv2-ivory)]"
                    }`}
                  >
                    {t.label}
                  </span>
                  {blurb ? (
                    <span className="text-[13px] leading-snug text-[var(--hv2-on-navy-muted)]">
                      {blurb}
                    </span>
                  ) : null}
                </>
              );
              return t.onClick ? (
                <a
                  key={t.id}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  tabIndex={open ? undefined : -1}
                  className={className}
                  onClick={(e) => {
                    e.preventDefault();
                    closeWithNav(() => t.onClick?.());
                  }}
                >
                  {label}
                </a>
              ) : (
                <Link
                  key={t.id}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  tabIndex={open ? undefined : -1}
                  className={className}
                  onClick={() => closeWithNav()}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          <div
            className="my-3 mb-2 h-px bg-[var(--hv2-hairline)]"
            role="separator"
          />

          <div className="flex flex-col">
            {secondaryLinks.map((s) => {
              const active = activeSecondary === s.id;
              const className = `flex min-h-11 items-center text-[17px] ${
                active
                  ? "text-[var(--hv2-gold)]"
                  : "text-[var(--hv2-on-navy)]"
              }`;
              return s.onClick ? (
                <a
                  key={s.id}
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  tabIndex={open ? undefined : -1}
                  className={className}
                  onClick={(e) => {
                    e.preventDefault();
                    closeWithNav(() => s.onClick?.());
                  }}
                >
                  {s.label}
                </a>
              ) : (
                <Link
                  key={s.id}
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  tabIndex={open ? undefined : -1}
                  className={className}
                  onClick={() => closeWithNav()}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col items-stretch gap-1.5 pt-4">
            <Link
              href={HOME_V2_START_FREE_HREF}
              tabIndex={open ? undefined : -1}
              className="accent-fill-gradient inline-flex h-[52px] w-full items-center justify-center rounded-full text-[16px] font-semibold text-[var(--hv2-navy)]"
              onClick={() => closeWithNav()}
            >
              Start free
            </Link>
            <Link
              href="/login"
              tabIndex={open ? undefined : -1}
              className="inline-flex h-11 items-center justify-center text-[15px] text-[var(--hv2-on-navy)]"
              onClick={() => closeWithNav()}
            >
              Sign in
            </Link>
          </div>
        </nav>
      </div>
    </div>,
    document.body,
  );
}
