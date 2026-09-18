"use client";

import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";

const FOOTER_NAV: { href: string; label: string }[] = [
  { href: "/meditate", label: "Meditate" },
  { href: "/journal", label: "Journal" },
  { href: "/manifest", label: "Manifest" },
  { href: "/focus", label: "Focus" },
  { href: "/chat", label: "Chat" },
  { href: "/read", label: "Read" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * Marketing site footer — floral field with a single content card.
 */
export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer mt-auto shrink-0 border-t border-border">
      <div className="relative z-[1] mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="app-footer-card flex flex-col gap-6 rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 max-w-sm">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
              >
                <LogoMark size={22} className="text-accent" />
                <span className="font-display text-lg font-medium tracking-tight">
                  consciously
                </span>
              </Link>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Live consciously — guided meditations, journal, and Manifest in
                one place.
              </p>
            </div>

            <nav
              aria-label="Footer"
              className="flex flex-wrap gap-x-5 gap-y-2 sm:justify-end"
            >
              {FOOTER_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-muted transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>© {year} Consciously</p>
            <p className="sm:text-right">consciously.live</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
