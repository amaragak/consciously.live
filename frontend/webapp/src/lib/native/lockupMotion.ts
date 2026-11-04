import {
  BRAND_GLOW_H,
  BRAND_GLOW_W,
  BRAND_LOCKUP_H,
  BRAND_LOCKUP_SCALE,
  BRAND_LOCKUP_W,
  BRAND_SUN_CX,
  BRAND_SUN_CY,
} from "@/lib/native/brand-lockup-markup";

export const LOCKUP_SCALE = BRAND_LOCKUP_SCALE;

export type Geo = { left: number; top: number; dx: number; dy: number };

/**
 * Rest slot = placeholder rect (same markup, unscaled). Splash offset puts the
 * lockup center on the shell center, matching the boot splash pose.
 */
export function measureLockupGeo(shell: HTMLElement, placeholder: HTMLElement): Geo {
  const s = shell.getBoundingClientRect();
  const slot = placeholder.getBoundingClientRect();
  const left = slot.left - s.left;
  const top = slot.top - s.top;
  return {
    left,
    top,
    dx: s.width / 2 - (left + slot.width / 2),
    dy: s.height / 2 - (top + slot.height / 2),
  };
}

function applySlot(lockup: HTMLElement, g: Geo) {
  lockup.style.left = `${g.left}px`;
  lockup.style.top = `${g.top}px`;
  lockup.style.transform = "none";
  lockup.style.transformOrigin = "50% 50%";
}

/** Glow box centred on the sun; origin = lockup centre so the same keyframes move both as one. */
function applyGlowSlot(glow: HTMLElement, g: Geo) {
  const left = g.left + BRAND_SUN_CX - BRAND_GLOW_W / 2;
  const top = g.top + BRAND_SUN_CY - BRAND_GLOW_H / 2;
  glow.style.left = `${left}px`;
  glow.style.top = `${top}px`;
  glow.style.transform = "none";
  glow.style.transformOrigin = `${g.left + BRAND_LOCKUP_W / 2 - left}px ${g.top + BRAND_LOCKUP_H / 2 - top}px`;
}

function pose(el: HTMLElement, translate: string, scale: string) {
  el.style.translate = translate;
  el.style.scale = scale;
}

/** Splash pose: centred, large. */
export function placeCentred(lockup: HTMLElement, g: Geo, S = LOCKUP_SCALE, glow?: HTMLElement | null) {
  applySlot(lockup, g);
  pose(lockup, `${g.dx}px ${g.dy}px`, String(S));
  if (glow) {
    applyGlowSlot(glow, g);
    pose(glow, `${g.dx}px ${g.dy}px`, String(S));
  }
}

/** Band rest pose. */
export function placeFinal(lockup: HTMLElement, g: Geo, glow?: HTMLElement | null) {
  applySlot(lockup, g);
  pose(lockup, "0px 0px", "1");
  if (glow) {
    applyGlowSlot(glow, g);
    pose(glow, "0px 0px", "1");
  }
}

const EASE_LOCKUP = "cubic-bezier(0.6, 0, 0.2, 1)";
const EASE_FORM = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export async function playIntoSignUp(opts: {
  lockup: HTMLElement;
  glow?: HTMLElement | null;
  form: HTMLElement;
  bandCopy: HTMLElement;
  g: Geo;
  S?: number;
}): Promise<void> {
  const { lockup, glow, form, bandCopy, g } = opts;
  const S = opts.S ?? LOCKUP_SCALE;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  form.getAnimations().forEach((a) => a.cancel());
  bandCopy.getAnimations().forEach((a) => a.cancel());
  lockup.getAnimations().forEach((a) => a.cancel());
  glow?.getAnimations().forEach((a) => a.cancel());

  if (reduce) {
    placeFinal(lockup, g, glow);
    form.style.transform = "translateY(0px)";
    bandCopy.style.opacity = "1";
    bandCopy.style.transform = "translateY(0px)";
    return;
  }

  const formH = Math.max(form.getBoundingClientRect().height, form.offsetHeight);

  placeCentred(lockup, g, S, glow);
  void lockup.getBoundingClientRect();

  // translate and scale share one timeline ⇒ center moves on a straight diagonal.
  const frames: Keyframe[] = [
    { translate: `${g.dx}px ${g.dy}px`, scale: String(S) },
    { translate: "0px 0px", scale: "1" },
  ];
  const timing: KeyframeAnimationOptions = { duration: 480, easing: EASE_LOCKUP, fill: "forwards" };
  const aLockup = lockup.animate(frames, timing);
  const aGlow = glow?.animate(frames, timing);

  const aForm = form.animate(
    [{ transform: `translateY(${formH}px)` }, { transform: "translateY(0px)" }],
    { duration: 500, delay: 200, easing: EASE_FORM, fill: "forwards" },
  );

  const aCopy = bandCopy.animate(
    [
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "translateY(0px)" },
    ],
    { duration: 280, delay: 420, easing: "ease-out", fill: "forwards" },
  );

  await Promise.all([aLockup.finished, aForm.finished, aCopy.finished, aGlow?.finished]);

  placeFinal(lockup, g, glow);
  form.style.transform = "translateY(0px)";
  bandCopy.style.opacity = "1";
  bandCopy.style.transform = "translateY(0px)";
  [aLockup, aForm, aCopy, aGlow].forEach((a) => a?.cancel());
}
