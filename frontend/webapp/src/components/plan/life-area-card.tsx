import { Link } from "react-router-dom";
import { IconArrowRight } from "@tabler/icons-react";
import { lifeAreaCardBgVars } from "@/lib/ideate-life-area-colors";

const CARD_CLASS =
  "life-area-card group relative flex flex-col rounded-[4px] px-4 py-3 shadow-[0_4px_14px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.05)] transition-[transform,box-shadow] duration-150 sm:aspect-square sm:p-[22px] sm:shadow-[0_8px_24px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.35),0_1px_4px_rgba(0,0,0,0.25)] dark:sm:shadow-[0_8px_24px_rgba(0,0,0,0.45),0_2px_8px_rgba(0,0,0,0.3)]";

const CARD_INTERACTIVE_CLASS =
  "cursor-pointer hover:-translate-y-px hover:shadow-[0_8px_20px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_20px_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.3)] sm:hover:-translate-y-[3px] sm:hover:shadow-[0_16px_40px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.1)] dark:sm:hover:shadow-[0_16px_40px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.35)]";

type LifeAreaCardProps =
  | {
      loading: true;
      creationIndex?: number;
    }
  | {
      loading?: false;
      href: string;
      title: string;
      snippet: string | null;
      lastInteracted: string;
      creationIndex: number;
    };

/**
 * Life area tile on Manifest overview. Pass `loading` to keep the same card
 * chrome while content slots pulse — layout stays aligned if card styles change.
 */
export function LifeAreaCard(props: LifeAreaCardProps) {
  const creationIndex =
    props.loading === true ? (props.creationIndex ?? 0) : props.creationIndex;
  const bgVars = lifeAreaCardBgVars(creationIndex);

  if (props.loading) {
    return (
      <div className={CARD_CLASS} style={bgVars} aria-hidden>
        <div className="h-5 w-[72%] animate-pulse rounded-sm bg-black/10 dark:bg-white/10 sm:h-7" />
        <div className="mt-2 h-3 w-full animate-pulse rounded-sm bg-black/[0.07] dark:bg-white/[0.08] sm:mt-3 sm:h-3.5" />
        <div className="mt-1.5 hidden h-3 w-[88%] animate-pulse rounded-sm bg-black/[0.07] dark:bg-white/[0.08] sm:block" />
        <div className="mt-1.5 h-2.5 w-[55%] animate-pulse rounded-sm bg-black/[0.06] dark:bg-white/[0.06] sm:mt-auto sm:pt-3" />
      </div>
    );
  }

  const { href, title, snippet, lastInteracted } = props;

  return (
    <Link
      to={href}
      className={`${CARD_CLASS} ${CARD_INTERACTIVE_CLASS}`}
      style={bgVars}
    >
      <h3 className="shrink-0 truncate font-display text-base font-medium leading-snug tracking-tight text-[#1E2530] dark:text-[#F4F0E8] sm:pr-2 sm:text-xl sm:text-[1.375rem]">
        {title.trim() || "Untitled"}
      </h3>
      <p
        className={`mt-0.5 font-sans text-[12px] leading-snug text-[rgba(60,35,15,0.6)] dark:text-[#A8B0BC] max-sm:truncate sm:mt-2 sm:line-clamp-3 sm:min-h-0 sm:flex-1 sm:text-sm sm:leading-relaxed ${
          snippet ? "" : "italic"
        }`}
      >
        {snippet ?? "Nothing written yet"}
      </p>
      <p className="mt-1.5 shrink-0 font-sans text-[11px] leading-snug text-[rgba(60,35,15,0.4)] dark:text-[#A8B0BC]/70 sm:mt-auto sm:pt-3 sm:pr-11">
        Last interacted on {lastInteracted}
      </p>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-[16px] right-[16px] inline-flex h-9 w-9 translate-x-1 items-center justify-center rounded-full border border-[#1E2530] bg-transparent text-[#1E2530] opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 max-md:hidden dark:border-[#F4F0E8] dark:text-[#F4F0E8]"
      >
        <IconArrowRight size={16} stroke={2} />
      </span>
    </Link>
  );
}
