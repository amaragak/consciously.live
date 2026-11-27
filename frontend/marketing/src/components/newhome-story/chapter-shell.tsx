import type { ReactNode } from "react";
import { Lockup } from "@/components/home-v2/lockup";

export type ChapterTone = "cream" | "cream-alt" | "navy";

type ChapterProps = {
  /** Anchor id; also the feature name used by the header links. */
  id: "journal" | "meditate" | "heal" | "focus" | "manifest";
  number: number;
  tone: ChapterTone;
  moment: string;
  title: string;
  /** Lede copy. Pass `{ desktop, mobile }` when the reference differs. */
  lede: ReactNode;
  children: ReactNode;
  quote?: {
    text: string;
    by: string;
  };
};

/** Copy that differs between the desktop and mobile references. */
export function Copy({
  desktop,
  mobile,
}: {
  desktop: ReactNode;
  mobile: ReactNode;
}) {
  return (
    <>
      <span className="ns-lg-only">{desktop}</span>
      <span className="ns-sm-only">{mobile}</span>
    </>
  );
}

/** One chapter of the week: timeline number, lockup, moment, heading, visual. */
export function Chapter({
  id,
  number,
  tone,
  moment,
  title,
  lede,
  children,
  quote,
}: ChapterProps) {
  const navy = tone === "navy";
  return (
    <section
      id={id}
      className={`ns-chapter is-${tone}`}
      aria-labelledby={`${id}-title`}
    >
      <div className="ns-wrap ns-chapter-grid">
        <div className="ns-rail" aria-hidden>
          <span className="ns-num">{number}</span>
          <span className="ns-rail-line" />
        </div>
        <div className="ns-chapter-body">
          <div className="ns-chapter-head">
            <span className="ns-num ns-num-inline" aria-hidden>
              {number}
            </span>
            <Lockup tool={id} size="eyebrow" onNavy={navy} />
          </div>
          <span className="ns-moment">{moment}</span>
          <h2 id={`${id}-title`} className="ns-display">
            {title}
          </h2>
          <p className="ns-chapter-lede">{lede}</p>
          <div className="ns-visual">{children}</div>
          {quote ? (
            <figure className="ns-quote">
              <blockquote>“{quote.text}”</blockquote>
              <figcaption>{quote.by}</figcaption>
            </figure>
          ) : null}
        </div>
      </div>
    </section>
  );
}
