import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { JournalPromptQuestion } from "@/components/journal-prompt-question";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    journalPrompt: {
      insertJournalPrompt: (attrs: {
        promptId: string;
        template: string;
        name?: string;
      }) => ReturnType;
      focusJournalPrompt: (promptId: string) => ReturnType;
    };
  }
}

/**
 * Prompt as a bold bronze line. Nested answer content (legacy) is kept in the
 * doc but not shown — new inserts place a plain paragraph under the line.
 */
function JournalPromptView({ node }: NodeViewProps) {
  const template = String(node.attrs.template ?? "");
  const name = String(node.attrs.name ?? "");

  return (
    <NodeViewWrapper
      as="div"
      className="journal-prompt-line my-2 text-base font-semibold leading-[1.5] text-[#8A6424]"
      data-prompt-id={String(node.attrs.promptId ?? "")}
    >
      <JournalPromptQuestion template={template} name={name} />
    </NodeViewWrapper>
  );
}

export const JournalPrompt = Node.create({
  name: "journalPrompt",
  group: "block",
  content: "block+",
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      promptId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-prompt-id") ?? "",
        renderHTML: (attrs) =>
          attrs.promptId ? { "data-prompt-id": attrs.promptId } : {},
      },
      template: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-template") ?? "",
        renderHTML: (attrs) =>
          attrs.template ? { "data-template": attrs.template } : {},
      },
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-name") ?? "",
        renderHTML: (attrs) => (attrs.name ? { "data-name": attrs.name } : {}),
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-collapsed") === "1",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-journal-prompt]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-journal-prompt": "1" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(JournalPromptView);
  },

  addCommands() {
    return {
      insertJournalPrompt:
        (attrs) =>
        ({ editor, state, chain }) => {
          const { $from } = state.selection;
          // Mid-paragraph (or any textblock): insert after the current block.
          const insertPos = $from.after($from.depth);
          const ok = chain()
            .insertContentAt(insertPos, [
              {
                type: this.name,
                attrs: {
                  promptId: attrs.promptId,
                  template: attrs.template,
                  name: attrs.name ?? "",
                  collapsed: false,
                },
                // Required by content: "block+"; not shown in the node view.
                content: [{ type: "paragraph" }],
              },
              { type: "paragraph" },
            ])
            .run();
          if (!ok) return false;
          // Caret on the new plain line under the prompt.
          let focusPos: number | null = null;
          editor.state.doc.descendants((node, p) => {
            if (
              node.type.name === this.name &&
              node.attrs.promptId === attrs.promptId
            ) {
              focusPos = p + node.nodeSize + 1;
            }
          });
          if (focusPos != null) {
            const { tr } = editor.state;
            try {
              const sel = TextSelection.create(tr.doc, focusPos);
              editor.view.dispatch(tr.setSelection(sel).scrollIntoView());
              editor.view.focus();
            } catch {
              editor.commands.focus(focusPos);
            }
          }
          return true;
        },
      focusJournalPrompt:
        (promptId) =>
        ({ editor, state }) => {
          let pos: number | null = null;
          state.doc.descendants((node, p) => {
            if (
              node.type.name === this.name &&
              node.attrs.promptId === promptId
            ) {
              pos = p;
              return false;
            }
          });
          if (pos == null) return false;
          try {
            const { tr } = editor.state;
            const after = pos + (state.doc.nodeAt(pos)?.nodeSize ?? 1);
            const sel = TextSelection.near(tr.doc.resolve(after));
            editor.view.dispatch(tr.setSelection(sel).scrollIntoView());
            editor.view.focus();
          } catch {
            /* ignore */
          }
          requestAnimationFrame(() => {
            const dom = editor.view.nodeDOM(pos!);
            if (dom instanceof HTMLElement) {
              dom.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          });
          return true;
        },
    };
  },
});
