import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, type ReactNode } from "react";
import { List, ListOrdered, Redo2, Undo2 } from "lucide-react";

const editorClass =
  "min-h-[16rem] w-full px-3 py-3 text-[15px] leading-relaxed text-foreground focus:outline-none " +
  "[&_.ProseMirror]:min-h-[16rem] [&_p]:my-2 [&_p.is-editor-empty:first-child::before]:text-muted/60 " +
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-medium [&_h2]:tracking-tight " +
  "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-medium " +
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:my-0.5 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted " +
  "[&_strong]:font-semibold [&_em]:italic [&_a]:text-accent-link [&_a]:underline";

type Props = {
  /** Remount / reseed key when switching posts. */
  docId: string;
  initialHtml: string;
  placeholder?: string;
  onHtmlChange: (html: string) => void;
};

export function ReadRichEditor({
  docId,
  initialHtml,
  placeholder = "Write the post…",
  onHtmlChange,
}: Props) {
  const seededForRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: initialHtml || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: editorClass,
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onHtmlChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (seededForRef.current === docId) return;
    seededForRef.current = docId;
    editor.commands.setContent(initialHtml || "", { emitUpdate: false });
  }, [docId, initialHtml, editor]);

  if (!editor) {
    return (
      <div className="mt-1 min-h-[16rem] rounded-lg border border-border bg-background px-3 py-3 text-sm text-muted">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        <ToolbarBtn
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarBtn>
        <ToolbarBtn
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarBtn>
        <ToolbarBtn
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => {
            const chain = editor.chain().focus();
            if (editor.isActive("heading", { level: 2 })) {
              chain.setParagraph().run();
            } else {
              chain.setHeading({ level: 2 }).run();
            }
          }}
        >
          H2
        </ToolbarBtn>
        <ToolbarBtn
          label="Subheading"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => {
            const chain = editor.chain().focus();
            if (editor.isActive("heading", { level: 3 })) {
              chain.setParagraph().run();
            } else {
              chain.setHeading({ level: 3 }).run();
            }
          }}
        >
          H3
        </ToolbarBtn>
        <ToolbarBtn
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          “”
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarBtn
          label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="size-3.5" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="size-3.5" aria-hidden />
        </ToolbarBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarBtn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : active
            ? "cursor-pointer bg-selected text-on-selected"
            : "cursor-pointer text-muted hover:bg-accent-soft/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** True when body is TipTap/HTML rather than legacy markdown. */
export function looksLikeHtml(body: string): boolean {
  return /^\s*</.test(body.trim());
}

/** Seed TipTap from stored body (HTML or legacy markdown plaintext). */
export function bodyToEditorHtml(body: string): string {
  const t = body.trim();
  if (!t) return "";
  if (looksLikeHtml(t)) return t;
  return t
    .split(/\n\n+/)
    .map((para) => {
      const esc = para
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
      return `<p>${esc}</p>`;
    })
    .join("");
}
