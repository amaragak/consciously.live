import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

const CACHE_PREFIX = "mm_load_cache_v1:";

/** Last successful payload for a screen, so the next open paints immediately. */
export function readLoadCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeLoadCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* Quota or private mode — the live data still shows. */
  }
}

/**
 * Hold a blank gap for the first ~300ms so a fast load never flashes.
 * After ~15s with no result, surface the error state.
 */
export function useDelayedLoading(active: boolean, resetKey = 0): {
  showPlaceholder: boolean;
  timedOut: boolean;
} {
  const [phase, setPhase] = useState<"off" | "wait" | "show" | "timeout">("off");
  useEffect(() => {
    if (!active) {
      setPhase("off");
      return;
    }
    setPhase("wait");
    const show = window.setTimeout(() => setPhase("show"), 300);
    const fail = window.setTimeout(() => setPhase("timeout"), 15_000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(fail);
    };
  }, [active, resetKey]);
  return {
    showPlaceholder: phase === "show",
    timedOut: phase === "timeout",
  };
}

function Block({
  className = "",
  rounded = "rounded-md",
}: {
  className?: string;
  rounded?: string;
}) {
  return <span aria-hidden className={`mm-placeholder block ${rounded} ${className}`} />;
}

export function PlaceholderLine({ className = "h-3.5 w-2/3" }: { className?: string }) {
  return <Block className={className} />;
}

export function PlaceholderCircle({ className = "size-10" }: { className?: string }) {
  return <Block className={className} rounded="rounded-full" />;
}

export function PlaceholderRect({ className = "h-24 w-full" }: { className?: string }) {
  return <Block className={className} rounded="rounded-xl" />;
}

export function PlaceholderChip({ className = "h-6 w-16" }: { className?: string }) {
  return <Block className={className} rounded="rounded-full" />;
}

export function LibraryListPlaceholder({
  mode,
  count = 4,
}: {
  mode: "list" | "grid";
  count?: number;
}) {
  if (mode === "grid") {
    return (
      <ul
        className="mt-6 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
        aria-label="Loading meditations"
      >
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="rounded-[6px] border border-border bg-card p-5">
            <PlaceholderRect className="mb-3 aspect-[4/3] w-full" />
            <PlaceholderLine className="h-3 w-20" />
            <PlaceholderLine className="mt-2 h-5 w-[78%]" />
            <PlaceholderLine className="mt-2 h-3.5 w-full" />
            <PlaceholderLine className="mt-1 h-3.5 w-[64%]" />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="mt-6 w-full" aria-busy="true" aria-label="Loading meditations">
      <PlaceholderLine className="mb-2 h-3 w-14" />
      <ul className="flex w-full flex-col gap-3">
        {Array.from({ length: count }, (_, i) => (
          <li
            key={i}
            className="rounded-[6px] border border-border bg-card p-3.5 sm:p-4"
          >
            <div className="flex items-start gap-3 sm:gap-3.5">
              <PlaceholderRect className="size-[72px] shrink-0 sm:size-[117px]" />
              <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                <PlaceholderLine className="h-5 w-[52%]" />
                <PlaceholderLine className="h-3.5 w-[92%]" />
                <PlaceholderLine className="h-3.5 w-[70%]" />
                <div className="flex items-center gap-2 pt-1">
                  <PlaceholderCircle className="size-4" />
                  <PlaceholderLine className="h-3 w-28" />
                </div>
              </div>
              <div className="hidden flex-col items-end gap-2 sm:flex">
                <PlaceholderCircle className="size-10" />
                <PlaceholderChip className="h-8 w-20" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JournalListPlaceholder() {
  return (
    <div aria-busy="true" aria-label="Loading entries">
      <PlaceholderLine className="mb-2 h-3 w-16" />
      <ul className="overflow-hidden rounded-[18px] border border-border bg-card px-3.5">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className={i > 0 ? "border-t border-border" : undefined}>
            <div className="flex gap-3.5 py-3.5">
              <div className="flex w-11 shrink-0 flex-col items-center gap-1">
                <PlaceholderLine className="h-3 w-8" />
                <PlaceholderLine className="h-4 w-6" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <PlaceholderLine className="h-4 w-[70%]" />
                <PlaceholderLine className="h-3.5 w-[92%]" />
                <div className="flex gap-1.5">
                  <PlaceholderChip className="h-5 w-12" />
                  <PlaceholderChip className="h-5 w-16" />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TileGridPlaceholder({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-[14px] border border-border bg-card">
          <PlaceholderRect className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <PlaceholderLine className="h-4 w-[80%]" />
            <PlaceholderLine className="h-3 w-[50%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailPlaceholder() {
  return (
    <div className="mt-4 space-y-4" aria-busy="true" aria-label="Loading">
      <PlaceholderRect className="h-48 w-full" />
      <PlaceholderLine className="h-7 w-1/2" />
      <PlaceholderLine className="h-4 w-full" />
      <PlaceholderLine className="h-4 w-[88%]" />
      <PlaceholderLine className="h-4 w-[72%]" />
    </div>
  );
}

export function LineListPlaceholder({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card px-4 py-3">
          <PlaceholderLine className="h-4 w-[40%]" />
          <PlaceholderLine className="mt-2 h-3.5 w-[76%]" />
        </div>
      ))}
    </div>
  );
}

export function SettingsPlaceholder() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading settings">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card px-4 py-4">
          <PlaceholderLine className="h-4 w-32" />
          <PlaceholderLine className="mt-2 h-3.5 w-[60%]" />
        </div>
      ))}
    </div>
  );
}

/** Shown only after the delay, in place of a page that is still fetching. */
export function DelayedPlaceholder({
  active,
  onRetry,
  children,
}: {
  active: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  const { showPlaceholder, timedOut } = useDelayedLoading(active);
  if (!active) return null;
  if (timedOut) return <LoadError onRetry={onRetry} />;
  if (!showPlaceholder) return null;
  return <>{children}</>;
}

export function LoadError({
  onRetry,
  compact = false,
}: {
  onRetry?: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <p className="mb-3 text-sm text-muted">
        Couldn&apos;t refresh
        {onRetry ? (
          <>
            {" · "}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-2 hover:underline"
              onClick={onRetry}
            >
              Retry
            </button>
          </>
        ) : null}
      </p>
    );
  }
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card px-5 py-8 text-center">
      <p className="text-sm text-foreground">Couldn&apos;t load</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full bg-foreground px-4 py-1.5 text-sm text-background"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  message,
  actionLabel,
  onAction,
  href,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card px-5 py-8 text-center">
      <p className="text-sm text-muted">{message}</p>
      {href && actionLabel ? (
        <Link
          to={href}
          className="mt-3 inline-flex rounded-full bg-foreground px-4 py-1.5 text-sm text-background"
        >
          {actionLabel}
        </Link>
      ) : null}
      {onAction && actionLabel && !href ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 rounded-full bg-foreground px-4 py-1.5 text-sm text-background"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
