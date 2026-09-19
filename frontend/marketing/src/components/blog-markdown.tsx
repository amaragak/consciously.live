/**
 * Public Read body renderer. Prefers TipTap HTML; falls back to the legacy
 * markdown subset for older drafts.
 */
import type { ReactNode } from "react";

function looksLikeHtml(source: string): boolean {
  return /^\s*</.test(source.trim());
}

/** Allowlist sanitizer for TipTap StarterKit output (SSR-safe, no DOM). */
export function sanitizeReadHtml(html: string): string {
  let out = html
    .replace(/<\/(?:script|style|iframe|object|embed|form)\b[^>]*>/gi, "")
    .replace(/<(?:script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe|object|embed|form)>/gi, "")
    .replace(/<(?:script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\s(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, "");
  // Prefer CDN URLs from the editor upload; drop data: / blob: payloads.
  out = out.replace(
    /\ssrc\s*=\s*(?:"\s*(?:data:|blob:)[^"]*"|'\s*(?:data:|blob:)[^']*'|(?:data:|blob:)[^\s>]+)/gi,
    ' src=""',
  );
  return out;
}

function inlineToNodes(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(text.slice(last, m.index));
    }
    if (m[2]) {
      out.push(
        <strong key={`${keyPrefix}-b-${k++}`} className="font-semibold">
          {m[2]}
        </strong>,
      );
    } else if (m[3]) {
      out.push(
        <em key={`${keyPrefix}-i-${k++}`} className="italic">
          {m[3]}
        </em>,
      );
    } else if (m[4] && m[5]) {
      out.push(
        <a
          key={`${keyPrefix}-a-${k++}`}
          href={m[5]}
          className="text-accent-link underline underline-offset-2 hover:opacity-90"
          rel="noopener noreferrer"
          target="_blank"
        >
          {m[4]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function MarkdownBody({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let b = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      blocks.push(
        <h3
          key={`h3-${b++}`}
          className="mt-8 font-display text-xl font-medium tracking-tight text-foreground"
        >
          {inlineToNodes(line.replace(/^###\s+/, ""), `h3-${b}`)}
        </h3>,
      );
      i += 1;
      continue;
    }
    if (/^##\s+/.test(line)) {
      blocks.push(
        <h2
          key={`h2-${b++}`}
          className="mt-10 font-display text-2xl font-medium tracking-tight text-foreground"
        >
          {inlineToNodes(line.replace(/^##\s+/, ""), `h2-${b}`)}
        </h2>,
      );
      i += 1;
      continue;
    }
    if (/^#\s+/.test(line)) {
      blocks.push(
        <h1
          key={`h1-${b++}`}
          className="mt-10 font-display text-3xl font-medium tracking-tight text-foreground"
        >
          {inlineToNodes(line.replace(/^#\s+/, ""), `h1-${b}`)}
        </h1>,
      );
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        const item = (lines[i] ?? "").replace(/^[-*]\s+/, "");
        items.push(
          <li key={`li-${b}-${items.length}`} className="leading-relaxed">
            {inlineToNodes(item, `li-${b}-${items.length}`)}
          </li>,
        );
        i += 1;
      }
      blocks.push(
        <ul
          key={`ul-${b++}`}
          className="mt-4 list-disc space-y-2 pl-5 text-[17px] text-foreground"
        >
          {items}
        </ul>,
      );
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^#{1,3}\s+/.test(lines[i] ?? "") &&
      !/^[-*]\s+/.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push(
      <p
        key={`p-${b++}`}
        className="mt-4 text-[17px] leading-relaxed text-foreground"
      >
        {inlineToNodes(para.join(" "), `p-${b}`)}
      </p>,
    );
  }

  if (blocks.length === 0 && source.trim()) {
    return (
      <p className="whitespace-pre-wrap text-[17px] leading-relaxed text-foreground">
        {source}
      </p>
    );
  }

  return <>{blocks}</>;
}

const proseClass =
  "read-prose max-w-none " +
  "[&_p]:mt-4 [&_p]:text-[17px] [&_p]:leading-relaxed [&_p]:text-foreground " +
  "[&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:text-foreground " +
  "[&_h3]:mt-8 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-medium [&_h3]:tracking-tight [&_h3]:text-foreground " +
  "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:text-[17px] [&_ul]:text-foreground " +
  "[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ol]:text-[17px] [&_ol]:text-foreground " +
  "[&_strong]:font-semibold [&_em]:italic " +
  "[&_a]:text-accent-link [&_a]:underline [&_a]:underline-offset-2";

export function ReadBody({ source }: { source: string }) {
  if (looksLikeHtml(source)) {
    return (
      <div
        className={proseClass}
        dangerouslySetInnerHTML={{ __html: sanitizeReadHtml(source) }}
      />
    );
  }
  return (
    <div className="read-prose max-w-none">
      <MarkdownBody source={source} />
    </div>
  );
}

/** @deprecated Use ReadBody */
export function BlogMarkdown({ source }: { source: string }) {
  return <ReadBody source={source} />;
}
