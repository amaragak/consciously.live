/**
 * Manifesto print export: full-length PNG capture and browser Print…
 * (pageless — no fixed A3/A2 page sizes).
 */

import { toPng } from "html-to-image";
import { PRINT_DESIGN_WIDTH } from "@/lib/manifesto-print";

export const PRINT_ROOT_ID = "manifesto-print-root";
const PRINT_STYLE_ID = "manifesto-print-page-style";

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/** Let layout, fonts and images settle before capture / print. */
export async function waitForPosterReady(root: HTMLElement): Promise<void> {
  await nextFrame();
  await nextFrame();
  try {
    await document.fonts?.ready;
  } catch {
    /* ignore */
  }
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
  await nextFrame();
}

function paperColor(node: HTMLElement): string {
  return getComputedStyle(node).backgroundColor || "#f3eee6";
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Capture the (unscaled, preview-state) poster. Pass height for a fixed page. */
export async function capturePosterPng(
  node: HTMLElement,
  opts: { pixelRatio: number; width: number; height?: number },
): Promise<string> {
  const height = Math.max(
    1,
    Math.ceil(opts.height ?? (node.scrollHeight || node.offsetHeight)),
  );
  return toPng(node, {
    pixelRatio: opts.pixelRatio,
    width: opts.width,
    height,
    backgroundColor: paperColor(node),
    style: {
      boxShadow: "none",
      margin: "0",
      transform: "none",
      height: `${height}px`,
    },
  });
}

/** Capture the sheet and download it. Phone wallpapers offer the share sheet when the browser can. */
export async function exportSheetPng(
  node: HTMLElement,
  opts: {
    filename: string;
    width: number;
    height?: number;
    pixelRatio: number;
    share?: boolean;
  },
): Promise<void> {
  const url = await capturePosterPng(node, opts);
  if (opts.share && typeof navigator.share === "function") {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], opts.filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  downloadDataUrl(url, opts.filename);
}
export async function exportDesktopPng(
  node: HTMLElement,
  filename: string,
): Promise<void> {
  const url = await capturePosterPng(node, {
    pixelRatio: 2,
    width: PRINT_DESIGN_WIDTH,
  });
  downloadDataUrl(url, filename);
}

/** Mobile: whole print at full length, 3× (no wallpaper padding). */
export async function exportMobilePng(
  node: HTMLElement,
  width: number,
  filename: string,
): Promise<void> {
  const url = await capturePosterPng(node, { pixelRatio: 3, width });
  downloadDataUrl(url, filename);
}

/**
 * Browser print dialog. Hides app chrome; scales the print to page width.
 * Uses `break-inside: avoid` on `[data-print-break]` sections.
 */
export function printPoster(): Promise<void> {
  return new Promise((resolve) => {
    document.getElementById(PRINT_STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = PRINT_STYLE_ID;
    style.textContent = `
@page { margin: 12mm; }
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    overflow: visible !important;
    background: transparent !important;
  }
  body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
  #${PRINT_ROOT_ID} {
    position: static !important;
    left: auto !important;
    top: auto !important;
    visibility: visible !important;
    display: block !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }
  #${PRINT_ROOT_ID} [data-manifesto-poster] {
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    box-shadow: none !important;
    transform: none !important;
  }
  #${PRINT_ROOT_ID} [data-manifesto-page] {
    break-after: page;
    page-break-after: always;
    box-shadow: none !important;
  }
  #${PRINT_ROOT_ID} [data-manifesto-page]:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  #${PRINT_ROOT_ID} [data-print-break] {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  #${PRINT_ROOT_ID}, #${PRINT_ROOT_ID} * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}`;
    document.head.appendChild(style);
    const done = () => {
      window.removeEventListener("afterprint", done);
      style.remove();
      resolve();
    };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => {
      window.print();
    }, 50);
  });
}
