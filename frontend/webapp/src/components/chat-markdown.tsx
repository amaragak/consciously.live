import { type ReactNode } from "react";

/**
 * Streaming-friendly markdown subset:
 * - **bold** — only when closing delimiters are found.
 * - *emphasis* — bold (script dialect) or italic (letters), via `singleAsteriskAs`.
 * - _italics_ — underscore emphasis.
 * - # heading — ATX only on complete lines (last line is plain until a trailing newline).
 */
function renderInlineInLine(
  line: string,
  keyPrefix: string,
  singleAsteriskAs: "bold" | "italic",
): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < line.length) {
    if (line.startsWith("**", i)) {
      const close = line.indexOf("**", i + 2);
      if (close === -1) {
        i += 2;
        continue;
      }
      if (close === i + 2) {
        i += 4;
        continue;
      }
      const inner = line.slice(i + 2, close);
      out.push(
        <strong key={`${keyPrefix}-b-${k++}`} className="font-semibold">
          {renderInlineInLine(inner, `${keyPrefix}-bi-${k}`, singleAsteriskAs)}
        </strong>,
      );
      i = close + 2;
      continue;
    }

    if (line[i] === "_" && (i === 0 || /\s/.test(line[i - 1]!))) {
      const close = line.indexOf("_", i + 1);
      if (close !== -1 && close > i + 1) {
        const after = line[close + 1];
        if (after == null || /[\s.,;:!?)\]]/.test(after)) {
          const inner = line.slice(i + 1, close);
          out.push(
            <em key={`${keyPrefix}-i-${k++}`} className="italic font-normal">
              {inner}
            </em>,
          );
          i = close + 1;
          continue;
        }
      }
    }

    const ch = line[i];
    if (ch !== "*") {
      const nextStar = line.indexOf("*", i);
      const nextUnd = line.indexOf("_", i);
      let next = -1;
      if (nextStar === -1) next = nextUnd;
      else if (nextUnd === -1) next = nextStar;
      else next = Math.min(nextStar, nextUnd);
      if (next === -1) {
        out.push(line.slice(i));
        break;
      }
      out.push(line.slice(i, next));
      i = next;
      continue;
    }

    // Single '*' marker
    const close = line.indexOf("*", i + 1);
    if (close === -1) {
      i += 1;
      continue;
    }
    if (close === i + 1) {
      i += 2;
      continue;
    }
    const inner = line.slice(i + 1, close);
    if (singleAsteriskAs === "italic") {
      out.push(
        <em key={`${keyPrefix}-i-${k++}`} className="italic font-normal">
          {inner}
        </em>,
      );
    } else {
      out.push(
        <strong key={`${keyPrefix}-b-${k++}`} className="font-semibold">
          {inner}
        </strong>,
      );
    }
    i = close + 1;
  }
  return out;
}

const PAUSE_RE = /\[\[PAUSE\s+([^\]]+)\]\]/g;

function renderBoldAndPausesInLine(
  line: string,
  keyPrefix: string,
  singleAsteriskAs: "bold" | "italic",
): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  while ((m = PAUSE_RE.exec(line)) !== null) {
    const start = m.index;
    const end = start + m[0].length;

    const before = line.slice(lastIndex, start);
    if (before)
      out.push(
        ...renderInlineInLine(before, `${keyPrefix}-pre-${k}`, singleAsteriskAs),
      );

    out.push(
      <em key={`${keyPrefix}-pause-${k}`} className="italic font-medium">
        {`Pause ${m[1]}`}
      </em>,
    );

    lastIndex = end;
    k++;
  }

  const after = line.slice(lastIndex);
  if (after)
    out.push(
      ...renderInlineInLine(after, `${keyPrefix}-post-${k}`, singleAsteriskAs),
    );

  return out;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

export function ChatMarkdown({
  text,
  className = "",
  /** Script dialect keeps *bold*; letters use standard *italic*. */
  singleAsteriskAs = "bold",
}: {
  text: string;
  className?: string;
  singleAsteriskAs?: "bold" | "italic";
}) {
  const lines = text.split("\n");
  const lastIndex = lines.length - 1;

  return (
    <div className={className}>
      {lines.map((line, idx) => {
        const isLastLine = idx === lastIndex;
        const lineComplete = !isLastLine || text.endsWith("\n");

        let inner: ReactNode;
        if (lineComplete) {
          const hm = line.match(HEADING_RE);
          if (hm) {
            const level = Math.min(hm[1].length, 6) as 1 | 2 | 3 | 4 | 5 | 6;
            const sizes: Record<number, string> = {
              1: "text-lg font-semibold tracking-tight",
              2: "text-base font-semibold tracking-tight",
              3: "text-[17px] font-semibold tracking-tight",
              4: "text-base font-semibold",
              5: "text-sm font-medium",
              6: "text-sm font-medium",
            };
            inner = (
              <div
                className={`${sizes[level]} mt-7 first:mt-0 mb-1.5 text-foreground`}
                role="heading"
                aria-level={level}
              >
                {renderBoldAndPausesInLine(
                  hm[2],
                  `h-${idx}`,
                  singleAsteriskAs,
                )}
              </div>
            );
          } else {
            inner = (
              <span className="block min-h-[1em] whitespace-pre-wrap">
                {renderBoldAndPausesInLine(line, `p-${idx}`, singleAsteriskAs)}
              </span>
            );
          }
        } else {
          inner = (
            <span className="block min-h-[1em] whitespace-pre-wrap">
              {renderBoldAndPausesInLine(
                line,
                `tail-${idx}`,
                singleAsteriskAs,
              )}
            </span>
          );
        }

        return (
          <div key={idx} className="min-h-[1em]">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
