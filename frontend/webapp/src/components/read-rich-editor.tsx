import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Image as ImageIcon,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  RectangleHorizontal,
  Redo2,
  Undo2,
} from "lucide-react";
import { uploadAdminBlogPostImage } from "@/lib/medimade-api";
import {
  ReadImage,
  compressBlogPostImage,
  type ReadImageLayout,
} from "@/components/read-image-extension";

const editorClass =
  "min-h-[16rem] w-full px-3 py-3 text-[15px] leading-relaxed text-foreground focus:outline-none " +
  "[&_.ProseMirror]:min-h-[16rem] [&_p]:my-2 [&_p.is-editor-empty:first-child::before]:text-muted/60 " +
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-medium [&_h2]:tracking-tight " +
  "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-medium " +
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:my-0.5 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted " +
  "[&_strong]:font-semibold [&_em]:italic [&_a]:text-accent-link [&_a]:underline " +
  "[&_img.read-img]:my-3 [&_img.read-img]:rounded-md [&_img.read-img]:h-auto " +
  "[&_img.read-img--inline]:mx-auto [&_img.read-img--inline]:block [&_img.read-img--inline]:max-w-full [&_img.read-img--inline]:w-auto " +
  "[&_img.read-img--full]:block [&_img.read-img--full]:w-full [&_img.read-img--full]:max-w-full";

export type ReadEditorLinkPost = {
  id: string;
  title: string;
  slug: string;
  published: boolean;
};

type Props = {
  /** Remount / reseed key when switching posts. */
  docId: string;
  initialHtml: string;
  placeholder?: string;
  onHtmlChange: (html: string, docId: string) => void;
  /** Other posts available to link (current post excluded by caller). */
  linkPosts?: ReadEditorLinkPost[];
};

function postHref(slug: string): string {
  return `/read/${encodeURIComponent(slug.trim())}`;
}

export function ReadRichEditor({
  docId,
  initialHtml,
  placeholder = "Write the post…",
  onHtmlChange,
  linkPosts = [],
}: Props) {
  const seedHtmlRef = useRef(initialHtml);
  seedHtmlRef.current = initialHtml;
  const onHtmlChangeRef = useRef(onHtmlChange);
  onHtmlChangeRef.current = onHtmlChange;
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const linkMenuRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pendingLayoutRef = useRef<ReadImageLayout>("inline");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          class: "text-accent-link underline underline-offset-2",
        },
      }),
      ReadImage,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: initialHtml || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: editorClass,
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onHtmlChangeRef.current(ed.getHTML(), docId);
    },
  }, [docId]);

  useEffect(() => {
    if (!editor) return;
    const html = seedHtmlRef.current?.trim() ? seedHtmlRef.current : "<p></p>";
    editor.commands.clearContent(false);
    editor.commands.setContent(html, { emitUpdate: false });
  }, [docId, editor]);

  useEffect(() => {
    if (!linkMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = linkMenuRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setLinkMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [linkMenuOpen]);

  if (!editor) {
    return (
      <div className="mt-1 min-h-[16rem] rounded-lg border border-border bg-background px-3 py-3 text-sm text-muted">
        Loading editor…
      </div>
    );
  }

  function applyPostLink(post: ReadEditorLinkPost) {
    if (!editor) return;
    const href = postHref(post.slug);
    const label = post.title.trim() || post.slug;
    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: label,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkMenuOpen(false);
  }

  function unlink() {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
  }

  function pickImage(layout: ReadImageLayout) {
    pendingLayoutRef.current = layout;
    setImageStatus(null);
    imageInputRef.current?.click();
  }

  async function onImageSelected(file: File | null) {
    if (!file || !editor) return;
    if (!file.type.startsWith("image/")) {
      setImageStatus("Choose an image file (JPEG, PNG, or WebP).");
      return;
    }
    const layout = pendingLayoutRef.current;
    setImageBusy(true);
    setImageStatus(null);
    try {
      const { dataUrl, mimeType } = await compressBlogPostImage(file);
      const { url } = await uploadAdminBlogPostImage({
        imageBase64: dataUrl,
        mimeType,
      });
      editor
        .chain()
        .focus()
        .insertContent({
          type: "image",
          attrs: { src: url, alt: "", layout },
        })
        .run();
      setImageStatus(
        layout === "full" ? "Full-width image inserted." : "Image inserted.",
      );
    } catch (e) {
      setImageStatus(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  const sortedLinkPosts = [...linkPosts].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );

  return (
    <div className="mt-1 rounded-lg border border-border bg-background">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={(e) => void onImageSelected(e.target.files?.[0] ?? null)}
      />
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 border-b border-border bg-background px-1.5 py-1">
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
        <div ref={linkMenuRef} className="relative">
          <ToolbarBtn
            label="Link to another post"
            active={editor.isActive("link") || linkMenuOpen}
            onClick={() => setLinkMenuOpen((o) => !o)}
          >
            <Link2 className="size-3.5" aria-hidden />
          </ToolbarBtn>
          {linkMenuOpen ? (
            <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Link to post
              </p>
              {sortedLinkPosts.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted">
                  No other posts yet.
                </p>
              ) : (
                <ul className="max-h-56 overflow-y-auto">
                  {sortedLinkPosts.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => applyPostLink(p)}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent-soft/50"
                      >
                        <span className="line-clamp-2 text-sm font-medium text-foreground">
                          {p.title || p.slug}
                        </span>
                        <span className="text-[11px] text-muted">
                          {p.published ? "Published" : "Draft"} · /read/{p.slug}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
        <ToolbarBtn
          label="Remove link"
          disabled={!editor.isActive("link")}
          onClick={unlink}
        >
          <Link2Off className="size-3.5" aria-hidden />
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarBtn
          label="Insert image (original aspect)"
          disabled={imageBusy}
          onClick={() => pickImage("inline")}
        >
          <ImageIcon className="size-3.5" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          label="Insert full-width image"
          disabled={imageBusy}
          onClick={() => pickImage("full")}
        >
          <RectangleHorizontal className="size-3.5" aria-hidden />
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
      {imageBusy || imageStatus ? (
        <p className="border-b border-border px-3 py-1.5 text-xs text-muted">
          {imageBusy ? "Uploading image…" : imageStatus}
        </p>
      ) : null}
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
