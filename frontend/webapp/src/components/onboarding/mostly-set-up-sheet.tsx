"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { DomainCoverageBars } from "@/components/onboarding/onboarding-flow";
import { useMinWidth } from "@/hooks/use-min-width";
import {
  detectOnboardingCoverage,
  markMostlySetUpSeen,
  missingCoveragePlainWords,
  onboardingHref,
  shouldShowMostlySetUpSheet,
} from "@/lib/onboarding-state";
import {
  ONB_EASE,
  ensureOnboardingMotionCss,
  usePrefersReducedMotion,
} from "@/lib/onboarding-motion";
import { useRouter } from "@/lib/spa-nav";

const MIST_BTN =
  "inline-flex h-11 items-center justify-center rounded-full border border-[#AFC2DC] px-6 text-[15px] font-semibold text-on-accent";
const SKIP =
  "cursor-pointer text-[14px] text-[#8A8478] underline-offset-2 hover:underline";

export function MostlySetUpSheet() {
  const router = useRouter();
  const desktop = useMinWidth(768);
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    ensureOnboardingMotionCss();
    if (!shouldShowMostlySetUpSheet()) return;
    setMounted(true);
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const subline = useMemo(() => {
    const cov = detectOnboardingCoverage();
    return missingCoveragePlainWords(cov.missing);
  }, [mounted]);

  if (!mounted || typeof document === "undefined") return null;

  function dismiss(then?: () => void) {
    setLeaving(true);
    setVisible(false);
    markMostlySetUpSeen();
    window.setTimeout(
      () => {
        setMounted(false);
        then?.();
      },
      reduced ? 150 : 300,
    );
  }

  function skip() {
    dismiss();
  }

  function fill() {
    dismiss(() => {
      router.push(onboardingHref({ step: "mostly_fill", mode: "mostly" }));
    });
  }

  const panelTransform = desktop
    ? visible && !leaving
      ? "translateY(0) scale(1)"
      : "translateY(12px) scale(0.98)"
    : visible && !leaving
      ? "translateY(0)"
      : "translateY(100%)";

  const panel = (
    <div
      className={
        desktop
          ? "relative w-full max-w-md rounded-[22px] border border-border bg-[#FBF8F2] p-5 shadow-[0_20px_60px_rgba(15,27,45,0.18)]"
          : "relative w-full rounded-t-[22px] border border-border bg-[#FBF8F2] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgba(15,27,45,0.14)]"
      }
      role="dialog"
      aria-labelledby="mostly-setup-title"
      style={{
        opacity: visible && !leaving ? 1 : 0,
        transform: reduced
          ? undefined
          : panelTransform,
        transition: reduced
          ? `opacity 150ms ${ONB_EASE}`
          : leaving
            ? `opacity 300ms ${ONB_EASE}, transform 300ms ${ONB_EASE}`
            : `opacity 400ms ${ONB_EASE}, transform 400ms ${ONB_EASE}`,
      }}
    >
      <h2
        id="mostly-setup-title"
        className="font-display text-[24px] font-normal leading-tight text-foreground"
      >
        We see you&apos;re already mostly set up.
      </h2>
      {subline ? (
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{subline}</p>
      ) : null}
      <div className="mt-4">
        <DomainCoverageBars />
      </div>
      <div className="mt-5 flex flex-col items-stretch gap-3">
        <button
          type="button"
          className={MIST_BTN}
          style={PRIMARY_ACCENT_FILL_STYLE}
          onClick={fill}
        >
          Fill the gaps
        </button>
        <button type="button" className={`${SKIP} self-center`} onClick={skip}>
          Skip
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-6">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-[#1E232E]/45"
        onClick={skip}
        style={{
          opacity: visible && !leaving ? 1 : 0,
          transition: `opacity ${reduced ? 150 : leaving ? 300 : 400}ms ${ONB_EASE}`,
        }}
      />
      <div className="relative z-[1] w-full md:flex md:justify-center">{panel}</div>
    </div>,
    document.body,
  );
}
