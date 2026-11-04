/**
 * Inline boot frame is injected into native `index.html` (see vite.config.ts).
 * JS only clears it once the React launch overlay has painted.
 */
const BOOT_ID = "native-boot-splash";

export function paintNativeBootSplash(): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.backgroundColor = "#1A1820";
  document.body.style.backgroundColor = "#1A1820";
  // HTML inject already painted the frame; nothing to add.
  if (document.getElementById(BOOT_ID)) return;
}

export function clearNativeBootSplash(): void {
  document.getElementById(BOOT_ID)?.remove();
  document.getElementById("native-boot-css")?.remove();
}
