/**
 * TipTap core ships a ClipboardTextSerializer that copies plain text and
 * strips bold/italic/links. Disable that extension and use this instead so
 * text/plain on the clipboard is Markdown (HTML clipboard stays rich).
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Slice } from "@tiptap/pm/model";
import { sliceToMarkdown } from "@/lib/tiptap-slice-to-markdown";

export const MarkdownClipboard = Extension.create({
  name: "markdownClipboard",
  /** Run before other clipboard text serializers. */
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("markdownClipboard"),
        props: {
          clipboardTextSerializer: (slice: Slice) => sliceToMarkdown(slice),
        },
      }),
    ];
  },
});

/** Pass into useEditor / Editor so TipTap’s plain-text core serializer is off. */
export const TIPTAP_DISABLE_PLAIN_CLIPBOARD = {
  clipboardTextSerializer: false,
} as const;
