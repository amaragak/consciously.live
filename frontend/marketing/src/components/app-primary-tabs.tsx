"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type PrimaryTabsContextValue = {
  target: HTMLElement | null;
  setTarget: (el: HTMLElement | null) => void;
  trailingTarget: HTMLElement | null;
  setTrailingTarget: (el: HTMLElement | null) => void;
};

const PrimaryTabsContext = createContext<PrimaryTabsContextValue | null>(null);

export function AppPrimaryTabsProvider({ children }: { children: ReactNode }) {
  const [target, setTargetState] = useState<HTMLElement | null>(null);
  const [trailingTarget, setTrailingTargetState] = useState<HTMLElement | null>(
    null,
  );
  const setTarget = useCallback((el: HTMLElement | null) => {
    setTargetState((prev) => (prev === el ? prev : el));
  }, []);
  const setTrailingTarget = useCallback((el: HTMLElement | null) => {
    setTrailingTargetState((prev) => (prev === el ? prev : el));
  }, []);
  const value = useMemo(
    () => ({ target, setTarget, trailingTarget, setTrailingTarget }),
    [target, setTarget, trailingTarget, setTrailingTarget],
  );
  return (
    <PrimaryTabsContext.Provider value={value}>
      {children}
    </PrimaryTabsContext.Provider>
  );
}

function usePrimaryTabsContext(): PrimaryTabsContextValue | null {
  return useContext(PrimaryTabsContext);
}

/** Mount point in the desktop top bar (centered). */
export function AppPrimaryTabsSlot({ className }: { className?: string }) {
  const ctx = usePrimaryTabsContext();
  if (!ctx) return null;
  return <div ref={ctx.setTarget} className={className} />;
}

/**
 * Renders primary page tabs into the top-bar centre on desktop (`md+`).
 * Pair with a `md:hidden` copy in the page content for mobile.
 */
export function AppPrimaryTabsDesktop({ children }: { children: ReactNode }) {
  const ctx = usePrimaryTabsContext();
  if (!ctx?.target) return null;
  return createPortal(children, ctx.target);
}

/** Mount point in the top bar trailing cluster (left of marketing CTA). */
export function AppTopBarTrailingSlot({ className }: { className?: string }) {
  const ctx = usePrimaryTabsContext();
  if (!ctx) return null;
  return <div ref={ctx.setTrailingTarget} className={className} />;
}

/** Renders into the top-bar trailing slot (create-audio Dev controls, etc.). */
export function AppTopBarTrailingPortal({ children }: { children: ReactNode }) {
  const ctx = usePrimaryTabsContext();
  if (!ctx?.trailingTarget) return null;
  return createPortal(children, ctx.trailingTarget);
}
