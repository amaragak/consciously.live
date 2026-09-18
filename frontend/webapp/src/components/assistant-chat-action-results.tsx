import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type {
  AssistantChatActionResult,
  AssistantChatActionResultItem,
} from "@/lib/assistant-chat-storage";

const BODY_COLLAPSE_CHARS = 160;
const LINES_COLLAPSE_COUNT = 4;

function needsBodyCollapse(body: string | undefined): boolean {
  if (!body) return false;
  return body.length > BODY_COLLAPSE_CHARS || body.split("\n").length > 3;
}

function ActionResultCard({ item }: { item: AssistantChatActionResultItem }) {
  const [expanded, setExpanded] = useState(false);
  const body = item.body?.trim() || "";
  const lines = (item.lines ?? []).map((l) => l.trim()).filter(Boolean);
  const contentLed = lines.length > 0 || Boolean(item.subtitle?.trim());
  const collapsible =
    needsBodyCollapse(body) || lines.length > LINES_COLLAPSE_COUNT;
  const showFull = expanded || !collapsible;

  const visibleLines = showFull
    ? lines
    : lines.slice(0, LINES_COLLAPSE_COUNT);

  let main: ReactNode;
  if (contentLed) {
    main = (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            {item.title}
          </p>
          {item.meta ? (
            <p className="shrink-0 text-[11px] tabular-nums text-muted/80">
              {item.meta}
            </p>
          ) : null}
        </div>
        {item.subtitle?.trim() ? (
          <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
            {item.subtitle.trim()}
          </p>
        ) : null}
        {lines.length ? (
          <ul className={`${item.subtitle?.trim() ? "mt-1.5" : "mt-2"} space-y-1.5`}>
            {visibleLines.map((line, i) => (
              <li
                key={`${i}-${line.slice(0, 24)}`}
                className="flex gap-2 text-sm leading-snug text-foreground"
              >
                <span
                  aria-hidden
                  className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-accent"
                />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {body ? (
          <p
            className={`mt-1.5 whitespace-pre-wrap text-sm leading-snug text-muted ${
              showFull ? "" : "line-clamp-3"
            }`}
          >
            {body}
          </p>
        ) : null}
      </>
    );
  } else {
    main = (
      <>
        {item.meta ? (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {item.meta}
          </p>
        ) : null}
        <p className="text-sm font-semibold leading-snug text-foreground">
          {item.title}
        </p>
        {body ? (
          <p
            className={`mt-1 whitespace-pre-wrap text-sm leading-snug text-muted ${
              showFull ? "" : "line-clamp-3"
            }`}
          >
            {body}
          </p>
        ) : null}
      </>
    );
  }

  const shellClass =
    "inline-block max-w-full rounded-2xl border border-accent/20 bg-accent-soft px-3.5 py-3 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft/80";

  const inner = (
    <>
      {main}
      {collapsible ? (
        <button
          type="button"
          className="relative z-[1] mt-2 cursor-pointer text-xs font-semibold text-accent-link underline-offset-2 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </>
  );

  if (item.href) {
    return (
      <Link to={item.href} className={`${shellClass} cursor-pointer`}>
        {inner}
      </Link>
    );
  }

  return <div className={shellClass}>{inner}</div>;
}

function ConfirmationChip({ result }: { result: AssistantChatActionResult }) {
  return (
    <div
      className={`flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-3.5 py-2.5 text-sm ${
        result.ok
          ? "border-accent/20 bg-accent-soft text-foreground"
          : "border-danger/30 bg-danger/5 text-danger"
      }`}
      role="status"
    >
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          {result.ok ? "✓ " : ""}
          {result.label}
        </span>
        {result.detail ? (
          <span className="mt-0.5 block truncate text-muted">
            {result.detail}
          </span>
        ) : null}
      </span>
      {result.ok && result.href ? (
        <Link
          to={result.href}
          className="shrink-0 font-semibold text-accent-link underline-offset-2 hover:underline"
        >
          {result.linkLabel ?? "Open"}
        </Link>
      ) : null}
    </div>
  );
}

export function AssistantChatActionResults({
  results,
}: {
  results: AssistantChatActionResult[];
}) {
  if (!results.length) return null;

  return (
    <div className="mt-2 flex w-fit max-w-full flex-col items-start gap-2">
      {results.map((result, ri) => {
        if (!result.ok) {
          return <ConfirmationChip key={ri} result={result} />;
        }
        if (result.items?.length) {
          return (
            <div key={ri} className="flex w-fit max-w-full flex-col items-start gap-2">
              {result.items.map((item, ii) => (
                <ActionResultCard
                  key={item.id ?? `${ri}-${ii}-${item.title}`}
                  item={item}
                />
              ))}
            </div>
          );
        }
        return <ConfirmationChip key={ri} result={result} />;
      })}
    </div>
  );
}
