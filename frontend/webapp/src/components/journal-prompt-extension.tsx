import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { SelectChevron } from "@/components/select-chevron";
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

function promptPreview(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return "";
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
}

function JournalPromptView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const collapsed = node.attrs.collapsed === true || node.attrs.collapsed === "1";
  const template = String(node.attrs.template ?? "");
  const name = String(node.attrs.name ?? "");
  const preview = promptPreview(node.textContent);

  const liftAnswer = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const current = editor.state.doc.nodeAt(pos);
    if (!current) return;
    const tr = editor.state.tr.replaceWith(
      pos,
      pos + current.nodeSize,
      current.content,
    );
    editor.view.dispatch(tr);
  };

  return (
    <NodeViewWrapper className="journal-prompt-block my-3 border-l-2 border-[#C8A46A] py-0.5 pl-3">
      <div className="flex items-start gap-2" contentEditable={false}>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand prompt" : "Collapse prompt"}
          onClick={() => updateAttributes({ collapsed: !collapsed })}
          className="mt-0.5 flex cursor-pointer text-accent-link"
        >
          <SelectChevron open={!collapsed} direction="right" className="text-accent-link" />
        </button>
        <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-accent-link">
          <JournalPromptQuestion template={template} name={name} />
        </span>
        <button
          type="button"
          aria-label="Remove question"
          onClick={liftAnswer}
          className="mt-0.5 flex cursor-pointer text-muted hover:text-foreground"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {collapsed ? (
        <p className="truncate pl-[26px] text-sm text-muted">
          {preview || "Write your answer…"}
        </p>
      ) : null}
      <NodeViewContent className={collapsed ? "hidden" : "journal-prompt-answer pl-[26px]"} />
    </NodeViewWrapper>
  );
}

export const JournalPrompt = Node.create({
  name: "journalPrompt",
  group: "block",
  content: "block+",
  defining: true,

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
        renderHTML: (attrs) => ({
          "data-collapsed": attrs.collapsed ? "1" : "0",
        }),
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
        ({ editor, chain }) => {
          const ok = chain()
            .insertContent({
              type: this.name,
              attrs: {
                promptId: attrs.promptId,
                template: attrs.template,
                name: attrs.name ?? "",
                collapsed: false,
              },
              content: [{ type: "paragraph" }],
            })
            .run();
          if (!ok) return false;
          let pos: number | null = null;
          editor.state.doc.descendants((node, p) => {
            if (
              node.type.name === this.name &&
              node.attrs.promptId === attrs.promptId
            ) {
              pos = p + 2;
            }
          });
          if (pos != null) editor.commands.focus(pos);
          return true;
        },
      focusJournalPrompt:
        (promptId) =>
        ({ editor }) => {
          let pos: number | null = null;
          editor.state.doc.descendants((node, p) => {
            if (
              node.type.name === this.name &&
              node.attrs.promptId === promptId
            ) {
              pos = p + 2;
              return false;
            }
          });
          if (pos == null) return false;
          return editor.chain().focus(pos).scrollIntoView().run();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        if (!state.selection.empty) return false;
        for (let depth = $from.depth; depth > 0; depth--) {
          const block = $from.node(depth);
          if (block.type.name !== this.name) continue;
          const para = $from.parent;
          if (para.type.name !== "paragraph" || para.textContent.length > 0) {
            return false;
          }
          if ($from.index(depth) !== block.childCount - 1) return false;
          if (block.childCount === 1) return false;
          const from = $from.before();
          const to = $from.after();
          const afterBlock = $from.after(depth) - (to - from);
          return this.editor
            .chain()
            .deleteRange({ from, to })
            .insertContentAt(afterBlock, { type: "paragraph" })
            .focus()
            .run();
        }
        return false;
      },
    };
  },
});
