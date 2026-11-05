import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { BrandLockup, BRAND_LOCKUP_SCALE } from "@/components/brand-lockup";
import { createBrandLockup, takeBootLockup, takeOrCreateGlow } from "@/lib/native/brand-lockup-markup";
import { clearNativeBootSplash } from "@/lib/native/native-boot-splash";
import {
  NATIVE_KEYBOARD_EVENT,
  setNativeKeyboardOverlay,
  type NativeKeyboardDetail,
} from "@/lib/native/native-bridge";
import {
  measureLockupGeo,
  placeCentred,
  placeFinal,
  playIntoSignUp,
  type Geo,
} from "@/lib/native/lockupMotion";

export const AUTH_LOCKUP_SCALE = BRAND_LOCKUP_SCALE;
export const AUTH_EXIT_MS = 250;
export const AUTH_REDUCED_MS = 200;

export type AuthOpenPhase = "loading" | "animating" | "ready";

/** Band height change between steps (consciously-native-band-consistent-v3). */
const BAND_EASE = "cubic-bezier(.2, .8, .2, 1)";
const BAND_MS = 250;
const COPY_FADE_MS = 150;

type BandSnapshot = { step: string; height: number; copy: HTMLElement | null };

export { BrandLockup };

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function readPlaceholder(shell: HTMLElement) {
  return shell.querySelector(".brand-lockup--placeholder") as HTMLElement | null;
}

async function waitFonts() {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch {
    /* ignore */
  }
}

/**
 * The moving lockup is the boot splash's own `.brand-lockup` node, moved into
 * the host div and only ever translated + scaled.
 */
export function AuthShell({
  phase,
  onPhase,
  children,
  exiting,
  reduceMotion,
  step,
}: {
  phase: AuthOpenPhase;
  onPhase: (p: AuthOpenPhase) => void;
  children: ReactNode;
  exiting?: boolean;
  reduceMotion?: boolean;
  /** Current auth step; a change animates the band height and cross-fades its copy. */
  step?: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const lockupRef = useRef<HTMLElement | null>(null);
  const glowHostRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLElement | null>(null);
  const geoRef = useRef<Geo | null>(null);
  const ranRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;

  const bandRef = useRef<BandSnapshot | null>(null);

  // After every render: if the step changed, ease the form from the old band
  // height to the new one and cross-fade the headline; then snapshot this band.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    const band = shell?.querySelector<HTMLElement>(".auth-split__brand");
    if (!shell || !band || step == null) return;
    const panel = shell.querySelector<HTMLElement>(".auth-split__panel");
    const copy = band.querySelector<HTMLElement>(".auth-split__brand-copy");
    const height = band.getBoundingClientRect().height;
    const prev = bandRef.current;

    if (prev && prev.step !== step && phaseRef.current === "ready" && !reduceRef.current) {
      const delta = prev.height - height;
      if (panel && Math.abs(delta) > 0.5) {
        panel.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0px)" }],
          { duration: BAND_MS, easing: BAND_EASE },
        );
      }
      if (prev.copy && copy) {
        const ghost = prev.copy;
        ghost.style.zIndex = "auto";
        band.appendChild(ghost);
        ghost
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration: COPY_FADE_MS, fill: "forwards" })
          .finished.catch(() => undefined)
          .finally(() => ghost.remove());
        copy.animate(
          [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }],
          { duration: COPY_FADE_MS * 2, easing: "ease-out" },
        );
      }
    }

    let ghost: HTMLElement | null = null;
    if (copy) {
      ghost = copy.cloneNode(true) as HTMLElement;
      ghost.classList.remove("relative");
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        position: "absolute",
        top: `${copy.offsetTop}px`,
        left: `${copy.offsetLeft}px`,
        width: `${copy.offsetWidth}px`,
        margin: "0",
        pointerEvents: "none",
      });
    }
    bandRef.current = { step, height, copy: ghost };
  });

  /** Move the splash node into the host (or build one from the same markup). */
  const adoptLockup = (): HTMLElement | null => {
    const host = hostRef.current;
    if (!host) return null;
    if (lockupRef.current) return lockupRef.current;
    const el = takeBootLockup() ?? createBrandLockup();
    host.appendChild(el);
    lockupRef.current = el;
    const glowHost = glowHostRef.current;
    if (glowHost && !glowRef.current) {
      const glow = takeOrCreateGlow();
      glowHost.appendChild(glow);
      glowRef.current = glow;
    }
    return el;
  };

  useEffect(() => {
    setNativeKeyboardOverlay(true);
    const onKeyboard = (e: Event) => {
      const { open, heightPx } = (e as CustomEvent<NativeKeyboardDetail>).detail;
      shellRef.current?.style.setProperty("--auth-kb-h", `${open ? heightPx : 0}px`);
    };
    window.addEventListener(NATIVE_KEYBOARD_EVENT, onKeyboard);
    return () => {
      window.removeEventListener(NATIVE_KEYBOARD_EVENT, onKeyboard);
      setNativeKeyboardOverlay(false);
    };
  }, []);

  // Run once. Do not put `phase` in deps — updating to animating must not cancel.
  useEffect(() => {
    if (phaseRef.current !== "loading") {
      const shell = shellRef.current;
      const lockup = adoptLockup();
      const ph = shell && readPlaceholder(shell);
      if (shell && lockup && ph) {
        const g = measureLockupGeo(shell, ph);
        geoRef.current = g;
        placeFinal(lockup, g, glowRef.current);
      }
      clearNativeBootSplash();
      return;
    }
    if (ranRef.current) return;
    ranRef.current = true;

    let unmounted = false;

    void (async () => {
      await waitFonts();
      if (unmounted) return;

      let shell: HTMLElement | null = null;
      let ph: HTMLElement | null = null;
      let form: HTMLElement | null = null;
      let bandCopy: HTMLElement | null = null;

      for (let i = 0; i < 120 && !unmounted; i++) {
        shell = shellRef.current;
        if (shell && hostRef.current) {
          ph = readPlaceholder(shell);
          form = shell.querySelector(".auth-split__panel");
          bandCopy = shell.querySelector(".auth-split__brand-copy");
          if (ph && form && bandCopy && ph.getBoundingClientRect().width > 0) {
            break;
          }
        }
        await sleep(16);
      }

      if (unmounted) return;
      if (!shell || !ph || !form || !bandCopy) {
        const lockup = adoptLockup();
        if (lockup && shell && ph) placeFinal(lockup, measureLockupGeo(shell, ph), glowRef.current);
        clearNativeBootSplash();
        onPhaseRef.current("ready");
        return;
      }

      // Same task: move splash node, pose it exactly where it was, drop the boot bg.
      const lockup = adoptLockup()!;
      const g = measureLockupGeo(shell, ph);
      geoRef.current = g;
      placeCentred(lockup, g, BRAND_LOCKUP_SCALE, glowRef.current);
      clearNativeBootSplash();

      await sleep(reduceRef.current ? 0 : 280);
      if (unmounted) return;

      onPhaseRef.current("animating");
      try {
        await playIntoSignUp({
          lockup,
          glow: glowRef.current,
          form,
          bandCopy,
          g,
          S: BRAND_LOCKUP_SCALE,
        });
      } catch {
        placeFinal(lockup, g, glowRef.current);
      }
      if (unmounted) return;
      onPhaseRef.current("ready");
    })();

    return () => {
      unmounted = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    const sync = () => {
      const shell = shellRef.current;
      const lockup = adoptLockup();
      if (!shell || !lockup) return;
      const ph = readPlaceholder(shell);
      if (!ph) return;
      const g = measureLockupGeo(shell, ph);
      geoRef.current = g;
      placeFinal(lockup, g, glowRef.current);
    };
    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [phase, children]);

  return (
    <div
      ref={shellRef}
      className={[
        "native-auth-shell",
        phase === "loading" ? "native-auth-shell--loading" : "",
        phase === "animating" ? "native-auth-shell--animating" : "",
        phase === "ready" ? "native-auth-shell--ready" : "",
        reduceMotion ? "native-auth-shell--reduced" : "",
        exiting ? "native-auth-shell--exit" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="native-auth-shell__paisley" aria-hidden />
      <div ref={glowHostRef} className="native-auth-shell__glow-host" aria-hidden />
      <div ref={hostRef} className="native-auth-shell__lockup-host" aria-hidden />
      <div className="native-auth-shell__content">{children}</div>
    </div>
  );
}
