/**
 * Guide body renderer: TipTap HTML (preferred) or a small markdown subset plus
 * `:::try` / `:::key` shortcodes (docs/design/app/GuideReader.CURSOR_PROMPT.md §4).
 *
 * Markdown path builds React elements only (no innerHTML). HTML path sanitises
 * TipTap output and injects heading ids for the contents list.
 */

import { Fragment, useMemo, type ReactNode } from "react";
import { Link } from "@/lib/spa-nav";

// ---------------------------------------------------------------------------
// Helpers shared with the reader + admin
// ---------------------------------------------------------------------------

export function looksLikeGuideHtml(source: string): boolean {
  return /^\s*</.test(source.trim());
}

const MARKDOWN_IN_TEXT_RE =
  /(?:^|\n)[ \t]*#{1,3}[ \t]+\S|(?:^|\n)[ \t]*:::[ \t]*[a-z]|(?:\*\*|__)|(?:^|\n)[ \t]*[-*+][ \t]+\S|(?:^|\n)[ \t]*\d+[.)][ \t]+\S|(?:^|\n)[ \t]*>[ \t]*\S/i;

/**
 * Some saves wrap legacy markdown in `<p>` / `<br>` and leave the marks as
 * text. When the document has no real tags, hand it back to the markdown parser.
 */
function markdownSourceFromBody(body: string): string | null {
  const trimmed = body.trim();
  if (!looksLikeGuideHtml(trimmed)) return null;
  const leftover = trimmed.replace(/<\/?(?:p|br)\b[^>]*\/?>/gi, "");
  if (/<[a-z!/]/i.test(leftover)) return null;
  const text = trimmed
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p\b[^>]*>/gi, "\n\n")
    .replace(/<\/?p\b[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);|&apos;/gi, "'");
  if (!MARKDOWN_IN_TEXT_RE.test(text)) return null;
  return text;
}

function renderableGuideBody(body: string): string {
  return markdownSourceFromBody(body) ?? body;
}

/** Allowlist sanitizer for TipTap StarterKit output (no DOM required). */
export function sanitizeGuideHtml(html: string): string {
  let out = html
    .replace(/<\/(?:script|style|iframe|object|embed|form)\b[^>]*>/gi, "")
    .replace(
      /<(?:script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe|object|embed|form)>/gi,
      "",
    )
    .replace(
      /<(?:script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?>/gi,
      "",
    );
  out = out.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(
    /\s(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi,
    "",
  );
  out = out.replace(
    /\ssrc\s*=\s*(?:"\s*(?:data:|blob:)[^"]*"|'\s*(?:data:|blob:)[^']*'|(?:data:|blob:)[^\s>]+)/gi,
    ' src=""',
  );
  return out;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words ÷ 200, rounded up, minimum 1 (mirrors the backend calculation). */
export function estimateGuideReadMinutes(body: string): number {
  const plain = looksLikeGuideHtml(body) ? stripHtmlToText(body) : body.trim();
  const words = plain.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export type GuideHeading = { id: string; text: string };

function slugifyHeading(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  );
}

/** Inject stable ids onto `<h2>` for the contents list / scroll. */
export function withGuideHeadingIds(html: string): string {
  let n = 0;
  const seen = new Map<string, number>();
  return html.replace(/<h2(\b[^>]*)>([\s\S]*?)<\/h2>/gi, (_m, attrs, inner) => {
    const text = stripHtmlToText(String(inner));
    let id = slugifyHeading(text) || `section-${++n}`;
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`;
    if (/\sid\s*=/.test(String(attrs))) {
      return `<h2${attrs}>${inner}</h2>`;
    }
    return `<h2${attrs} id="${id}">${inner}</h2>`;
  });
}

const GUIDE_HTML_PROSE =
  "guide-html-prose flex min-w-0 flex-col gap-[18px] " +
  "[&_p]:m-0 [&_p]:text-[17px] [&_p]:leading-[1.7] [&_p]:text-foreground/80 " +
  "[&_p:first-of-type]:font-display [&_p:first-of-type]:text-[21px] [&_p:first-of-type]:leading-[1.55] [&_p:first-of-type]:text-foreground " +
  "max-md:[&_p]:text-base max-md:[&_p]:leading-[1.65] max-md:[&_p:first-of-type]:text-[19px] " +
  "[&_h2]:m-0 [&_h2]:mt-3 [&_h2]:scroll-mt-24 [&_h2]:font-display [&_h2]:text-[25px] [&_h2]:font-normal [&_h2]:leading-[1.25] [&_h2]:text-foreground " +
  "max-md:[&_h2]:text-[22px] " +
  "[&_h3]:m-0 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-normal [&_h3]:text-foreground " +
  "[&_ul]:m-0 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:text-[17px] [&_ul]:leading-[1.7] [&_ul]:text-foreground/80 " +
  "[&_ol]:m-0 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ol]:text-[17px] [&_ol]:leading-[1.7] [&_ol]:text-foreground/80 " +
  "max-md:[&_ul]:text-base max-md:[&_ol]:text-base " +
  "[&_blockquote]:m-0 [&_blockquote]:border-l-[3px] [&_blockquote]:border-accent [&_blockquote]:py-1 [&_blockquote]:pl-5 " +
  "[&_blockquote]:font-display [&_blockquote]:text-[21px] [&_blockquote]:italic [&_blockquote]:leading-[1.5] [&_blockquote]:text-foreground " +
  "[&_strong]:font-semibold [&_em]:italic " +
  "[&_a]:text-accent-link [&_a]:underline-offset-2 hover:[&_a]:underline " +
  "[&_img]:my-0 [&_img]:w-full [&_img]:rounded-xl";

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

type TryItem =
  | { kind: "step"; title: string; desc: string }
  | { kind: "text"; text: string };

type Block =
  | { t: "p"; text: string }
  | { t: "h2" | "h3"; text: string; id: string }
  | { t: "list"; ordered: boolean; items: string[] }
  | { t: "quote"; text: string }
  | { t: "img"; alt: string; src: string }
  | { t: "hr" }
  | { t: "code"; text: string }
  | { t: "try"; label: string; items: TryItem[] }
  | { t: "key"; text: string };

/** Strip inline markdown to plain text (heading ids / TOC labels). */
function plainText(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w])[*_]([^*_\s][^*_]*?)[*_](?!\w)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function slugifyMarkdownHeading(text: string): string {
  return slugifyHeading(plainText(text));
}

const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;
const LIST_BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const LIST_NUMBER_RE = /^\s*\d+[.)]\s+(.*)$/;
const FENCE_RE = /^:::\s*([a-z]+)\s*(.*)$/i;

function isBlockStart(line: string): boolean {
  return (
    /^#{1,3}\s+\S/.test(line) ||
    /^>\s?/.test(line) ||
    LIST_BULLET_RE.test(line) ||
    LIST_NUMBER_RE.test(line) ||
    IMAGE_LINE_RE.test(line.trim()) ||
    /^```/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    FENCE_RE.test(line.trim())
  );
}

/** Split "**Notice** — text" into a bold title and a description. */
function parseTryStep(raw: string): { title: string; desc: string } {
  const text = raw.trim();
  const m = /^(?:\*\*|__)(.+?)(?:\*\*|__)\s*(?:[—–:-]\s*)?(.*)$/s.exec(text);
  if (m) return { title: m[1]!.trim(), desc: m[2]!.trim() };
  return { title: "", desc: text };
}

function parseTryBlock(lines: string[]): TryItem[] {
  const items: TryItem[] = [];
  let currentStep: string | null = null;
  const flushStep = () => {
    if (currentStep == null) return;
    const { title, desc } = parseTryStep(currentStep);
    items.push({ kind: "step", title, desc });
    currentStep = null;
  };
  let para: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    items.push({ kind: "text", text: para.join(" ") });
    para = [];
  };
  for (const line of lines) {
    const num = LIST_NUMBER_RE.exec(line);
    if (num) {
      flushPara();
      flushStep();
      currentStep = num[1]!;
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushStep();
      continue;
    }
    if (currentStep != null) currentStep += ` ${line.trim()}`;
    else para.push(line.trim());
  }
  flushPara();
  flushStep();
  return items;
}

function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const usedIds = new Map<string, number>();
  const makeId = (text: string) => {
    const base = slugifyMarkdownHeading(text);
    const n = (usedIds.get(base) ?? 0) + 1;
    usedIds.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code
    if (/^```/.test(trimmed)) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i]!.trim())) {
        buf.push(lines[i]!);
        i += 1;
      }
      i += 1;
      blocks.push({ t: "code", text: buf.join("\n") });
      continue;
    }

    // Shortcodes
    const fence = FENCE_RE.exec(trimmed);
    if (fence && (fence[1]!.toLowerCase() === "try" || fence[1]!.toLowerCase() === "key")) {
      const kind = fence[1]!.toLowerCase();
      const label = fence[2]!.trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && lines[i]!.trim() !== ":::") {
        buf.push(lines[i]!);
        i += 1;
      }
      i += 1; // closing :::
      if (kind === "try") {
        blocks.push({ t: "try", label, items: parseTryBlock(buf) });
      } else {
        blocks.push({
          t: "key",
          text: buf
            .map((l) => l.trim())
            .filter(Boolean)
            .join(" "),
        });
      }
      continue;
    }

    // Headings (# is treated as ## — the page owns the <h1>)
    const heading = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(trimmed);
    if (heading) {
      const level = heading[1]!.length === 3 ? "h3" : "h2";
      const text = heading[2]!;
      blocks.push({
        t: level,
        text,
        id: level === "h2" ? makeId(text) : "",
      });
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
      blocks.push({ t: "hr" });
      i += 1;
      continue;
    }

    const img = IMAGE_LINE_RE.exec(trimmed);
    if (img) {
      blocks.push({ t: "img", alt: img[1] ?? "", src: img[2]! });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!.trim())) {
        buf.push(lines[i]!.trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ t: "quote", text: buf.join(" ").trim() });
      continue;
    }

    if (LIST_BULLET_RE.test(line) || LIST_NUMBER_RE.test(line)) {
      const ordered = LIST_NUMBER_RE.test(line) && !LIST_BULLET_RE.test(line);
      const re = ordered ? LIST_NUMBER_RE : LIST_BULLET_RE;
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i]!;
        const m = re.exec(cur);
        if (m) {
          items.push(m[1]!.trim());
          i += 1;
        } else if (cur.trim() && /^\s{2,}\S/.test(cur) && items.length) {
          items[items.length - 1] += ` ${cur.trim()}`;
          i += 1;
        } else {
          break;
        }
      }
      blocks.push({ t: "list", ordered, items });
      continue;
    }

    // Paragraph
    const buf: string[] = [trimmed];
    i += 1;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !isBlockStart(lines[i]!)
    ) {
      buf.push(lines[i]!.trim());
      i += 1;
    }
    blocks.push({ t: "p", text: buf.join(" ") });
  }

  return blocks;
}

function extractGuideHeadingsFromHtml(body: string): GuideHeading[] {
  const html = withGuideHeadingIds(sanitizeGuideHtml(body));
  const out: GuideHeading[] = [];
  const re = /<h2\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/h2>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1]!.trim();
    const text = stripHtmlToText(m[2] ?? "");
    if (id && text) out.push({ id, text });
  }
  // TipTap may omit id until withGuideHeadingIds; also match bare h2s.
  if (out.length === 0) {
    const bare = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
    let bm: RegExpExecArray | null;
    const seen = new Map<string, number>();
    while ((bm = bare.exec(html)) !== null) {
      const text = stripHtmlToText(bm[1] ?? "");
      if (!text) continue;
      let id = slugifyHeading(text);
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      if (n > 1) id = `${id}-${n}`;
      out.push({ id, text });
    }
  }
  return out;
}

/** `##` / `<h2>` headings (same ids the renderer uses) for the contents list. */
export function extractGuideHeadings(body: string): GuideHeading[] {
  const source = renderableGuideBody(body);
  if (looksLikeGuideHtml(source)) return extractGuideHeadingsFromHtml(source);
  return parseBlocks(source)
    .filter((b): b is Extract<Block, { id: string }> => b.t === "h2")
    .map((b) => ({ id: b.id, text: plainText(b.text) }));
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  if (url.startsWith("#")) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
}

function safeImageSrc(raw: string): string | null {
  const url = raw.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
}

const INLINE_RE = new RegExp(
  [
    String.raw`!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)`, // 1 alt, 2 src
    String.raw`\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)`, // 3 text, 4 href
    String.raw`\*\*(.+?)\*\*`, // 5
    String.raw`__(.+?)__`, // 6
    String.raw`\*([^*\s](?:[^*]*?[^*\s])?)\*`, // 7
    String.raw`(?<!\w)_([^_\s](?:[^_]*?[^_\s])?)_(?!\w)`, // 8
    "`([^`]+)`", // 9
  ].join("|"),
  "g",
);

function InlineImage({ alt, src }: { alt: string; src: string }) {
  const safe = safeImageSrc(src);
  if (!safe) return <>{alt}</>;
  return (
    <img
      src={safe}
      alt={alt}
      loading="lazy"
      className="my-1 block w-full rounded-xl"
    />
  );
}

function GuideLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = safeHref(href);
  const cls =
    "text-accent-link underline-offset-2 hover:underline";
  if (!safe) return <>{children}</>;
  if (safe.startsWith("/")) {
    return (
      <Link href={safe} className={cls}>
        {children}
      </Link>
    );
  }
  if (safe.startsWith("#")) {
    return (
      <a href={safe} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  );
}

function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE_RE.source, "g");
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${n++}`;
    if (m[2] !== undefined) {
      out.push(<InlineImage key={key} alt={m[1] ?? ""} src={m[2]} />);
    } else if (m[4] !== undefined) {
      out.push(
        <GuideLink key={key} href={m[4]}>
          {renderInline(m[3]!, key)}
        </GuideLink>,
      );
    } else if (m[5] !== undefined || m[6] !== undefined) {
      out.push(
        <strong key={key} className="font-semibold text-foreground">
          {renderInline((m[5] ?? m[6])!, key)}
        </strong>,
      );
    } else if (m[7] !== undefined || m[8] !== undefined) {
      out.push(<em key={key}>{renderInline((m[7] ?? m[8])!, key)}</em>);
    } else if (m[9] !== undefined) {
      out.push(
        <code
          key={key}
          className="rounded bg-accent-soft px-1 py-0.5 font-mono text-[0.9em] text-foreground"
        >
          {m[9]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

const BODY_P =
  "m-0 text-[17px] leading-[1.7] text-foreground/80 max-md:text-base max-md:leading-[1.65]";

function TryBlock({
  label,
  items,
}: {
  label: string;
  items: TryItem[];
}) {
  let step = 0;
  return (
    <div className="flex flex-col gap-3.5 rounded-[14px] border border-accent/40 bg-accent-soft px-[22px] py-5 max-md:p-4">
      <span className="text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link">
        {label ? `Try this · ${label}` : "Try this"}
      </span>
      {items.map((item, idx) => {
        if (item.kind === "text") {
          return (
            <p key={idx} className="m-0 text-[15px] leading-[1.6] text-foreground/80">
              {renderInline(item.text, `try-${idx}`)}
            </p>
          );
        }
        step += 1;
        return (
          <div key={idx} className="flex gap-3.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-card text-[13px] font-semibold text-accent-link">
              {step}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              {item.title ? (
                <span className="text-base font-semibold text-foreground">
                  {renderInline(item.title, `try-${idx}-t`)}
                </span>
              ) : null}
              {item.desc ? (
                <span className="text-[15px] leading-[1.6] text-foreground/80">
                  {renderInline(item.desc, `try-${idx}-d`)}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function KeyBlock({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-background px-4 py-3.5">
      <span className="text-base text-accent-link" aria-hidden>
        ✦
      </span>
      <span className="min-w-0 text-[15px] leading-[1.6] text-foreground/80">
        <b className="font-semibold text-foreground">Key idea:</b>{" "}
        {renderInline(text, "key")}
      </span>
    </div>
  );
}

function renderBlock(block: Block, index: number, isLead: boolean): ReactNode {
  switch (block.t) {
    case "p":
      return isLead ? (
        <p
          key={index}
          className="m-0 font-display text-[21px] leading-[1.55] text-foreground max-md:text-[19px] max-md:leading-[1.5]"
        >
          {renderInline(block.text, `b${index}`)}
        </p>
      ) : (
        <p key={index} className={BODY_P}>
          {renderInline(block.text, `b${index}`)}
        </p>
      );
    case "h2":
      return (
        <h2
          key={index}
          id={block.id}
          className="mx-0 mb-0 mt-3 scroll-mt-24 font-display text-[25px] font-normal leading-[1.25] text-foreground max-md:text-[22px]"
        >
          {renderInline(block.text, `b${index}`)}
        </h2>
      );
    case "h3":
      return (
        <h3
          key={index}
          className="m-0 font-display text-xl font-normal leading-[1.3] text-foreground"
        >
          {renderInline(block.text, `b${index}`)}
        </h3>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          key={index}
          className={`m-0 flex flex-col gap-2 pl-6 text-[17px] leading-[1.7] text-foreground/80 max-md:text-base max-md:leading-[1.65] ${
            block.ordered ? "list-decimal" : "list-disc"
          } marker:text-accent-link`}
        >
          {block.items.map((item, j) => (
            <li key={j} className="pl-1">
              {renderInline(item, `b${index}-${j}`)}
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote
          key={index}
          className="mx-0 my-1 border-l-[3px] border-accent py-1 pl-5 pr-0 font-display text-[21px] italic leading-[1.5] text-foreground"
        >
          {renderInline(block.text, `b${index}`)}
        </blockquote>
      );
    case "img": {
      const src = safeImageSrc(block.src);
      if (!src) return null;
      return (
        <img
          key={index}
          src={src}
          alt={block.alt}
          loading="lazy"
          className="block w-full rounded-xl"
        />
      );
    }
    case "hr":
      return <hr key={index} className="m-0 h-px border-0 bg-border" />;
    case "code":
      return (
        <pre
          key={index}
          className="m-0 overflow-x-auto rounded-xl border border-border bg-background p-4 font-mono text-sm leading-relaxed text-foreground"
        >
          {block.text}
        </pre>
      );
    case "try":
      return <TryBlock key={index} label={block.label} items={block.items} />;
    case "key":
      return <KeyBlock key={index} text={block.text} />;
    default:
      return null;
  }
}

/**
 * Renders a guide body. The column gap (18px) is part of the design, so use
 * this inside a column that shares the same gap (or on its own).
 */
export function GuideBody({
  body,
  className = "",
}: {
  body: string;
  className?: string;
}) {
  const source = useMemo(() => renderableGuideBody(body), [body]);
  const isHtml = looksLikeGuideHtml(source);
  const html = useMemo(
    () =>
      isHtml
        ? withGuideHeadingIds(sanitizeGuideHtml(source))
        : "",
    [source, isHtml],
  );
  const blocks = useMemo(
    () => (isHtml ? [] : parseBlocks(source)),
    [source, isHtml],
  );
  // Lead = the first paragraph, but only when it precedes any heading.
  const leadIndex = useMemo(() => {
    for (let i = 0; i < blocks.length; i += 1) {
      const t = blocks[i]!.t;
      if (t === "p") return i;
      if (t === "h2" || t === "h3") return -1;
    }
    return -1;
  }, [blocks]);

  if (isHtml) {
    return (
      <div
        className={`${GUIDE_HTML_PROSE} ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className={`flex min-w-0 flex-col gap-[18px] ${className}`}>
      {blocks.map((b, i) => (
        <Fragment key={i}>{renderBlock(b, i, i === leadIndex)}</Fragment>
      ))}
    </div>
  );
}
