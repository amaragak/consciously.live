import Image from "@tiptap/extension-image";

export type ReadImageLayout = "inline" | "full";

/**
 * TipTap image with layout:
 * - inline: natural aspect, not stretched to content width
 * - full: full width of the content area (not viewport bleed)
 */
export const ReadImage = Image.extend({
  name: "image",
  addAttributes() {
    return {
      ...this.parent?.(),
      layout: {
        default: "inline" satisfies ReadImageLayout,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-layout");
          if (raw === "full") return "full";
          if (element.classList.contains("read-img--full")) return "full";
          return "inline";
        },
        renderHTML: (attributes: { layout?: string }) => {
          const layout: ReadImageLayout =
            attributes.layout === "full" ? "full" : "inline";
          return {
            "data-layout": layout,
            class:
              layout === "full"
                ? "read-img read-img--full"
                : "read-img read-img--inline",
          };
        },
      },
    };
  },
}).configure({
  inline: false,
  allowBase64: false,
  HTMLAttributes: {},
});

export async function compressBlogPostImage(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
}> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxSide = 1920;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { dataUrl, mimeType: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}
