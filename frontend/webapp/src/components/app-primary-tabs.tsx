import {
  createContext,
  forwardRef,
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
  /** Compact (&lt; md) header slot — tabs that replace the breadcrumb's last item. */
  phoneTarget: HTMLElement | null;
  setPhoneTarget: (el: HTMLElement | null) => void;
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
  const [phoneTarget, setPhoneTargetState] = useState<HTMLElement | null>(null);
  const setPhoneTarget = useCallback((el: HTMLElement | null) => {
    setPhoneTargetState((prev) => (prev === el ? prev : el));
  }, []);
  const value = useMemo(
    () => ({
      target,
      setTarget,
      trailingTarget,
      setTrailingTarget,
      phoneTarget,
      setPhoneTarget,
    }),
    [
      target,
      setTarget,
      trailingTarget,
      setTrailingTarget,
      phoneTarget,
      setPhoneTarget,
    ],
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
export const AppPrimaryTabsSlot = forwardRef<
  HTMLDivElement,
  { className?: string }
>(function AppPrimaryTabsSlot({ className }, ref) {
  const ctx = usePrimaryTabsContext();
  if (!ctx) return null;
  return (
    <div
      ref={(el) => {
        ctx.setTarget(el);
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className={className}
      data-app-primary-tabs-slot
    />
  );
});

/**
 * Renders primary page tabs / create stepper into the top-bar centre (md+;
 * matches wordmark reveal — phone uses sidebar / in-page copies).
 */
export function AppPrimaryTabsDesktop({ children }: { children: ReactNode }) {
  const ctx = usePrimaryTabsContext();
  if (!ctx?.target) return null;
  return createPortal(children, ctx.target);
}

/**
 * Mount point in the compact (&lt; md) top bar, after the breadcrumb — for page
 * tabs that take the place of the breadcrumb's last item.
 */
export function AppPrimaryTabsPhoneSlot({ className }: { className?: string }) {
  const ctx = usePrimaryTabsContext();
  if (!ctx) return null;
  return <div ref={ctx.setPhoneTarget} className={className} />;
}

/** Renders into the compact (&lt; md) header slot. */
export function AppPrimaryTabsPhone({ children }: { children: ReactNode }) {
  const ctx = usePrimaryTabsContext();
  if (!ctx?.phoneTarget) return null;
  return createPortal(children, ctx.phoneTarget);
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
