import { useState, type FormEvent, type ReactNode } from "react";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { SelectChevron } from "@/components/select-chevron";
import { Link } from "@/lib/spa-nav";

export type OverviewHeroLink = {
  href: string;
  label: string;
  count?: number;
  icon: ReactNode;
};

export function OverviewHero({
  question,
  actionHref,
  actionLabel,
  actionIcon,
  placeholder,
  promptLabel,
  prompts,
  onPrompt,
  onSubmit,
  links,
}: {
  question: string;
  actionHref: string;
  actionLabel: string;
  actionIcon: ReactNode;
  placeholder: string;
  promptLabel: string;
  prompts: readonly string[];
  onPrompt: (prompt: string) => void;
  onSubmit: (text: string) => void;
  links?: readonly OverviewHeroLink[];
}) {
  const [draft, setDraft] = useState("");

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSubmit(text);
  };

  return (
    <section
      className="relative flex flex-col gap-2.5 overflow-hidden rounded-[22px] px-4 py-3.5 shadow-[0_12px_34px_rgba(15,27,45,0.18)] md:gap-3.5 md:px-7 md:pb-[22px] md:pt-6"
      style={{ backgroundColor: "#0F1B2D" }}
    >
      <div className="navy-paisley-plate" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 88% 18%, rgba(217,184,124,0.22) 0, rgba(217,184,124,0) 38%)",
        }}
        aria-hidden
      />
      <div className="relative flex flex-col gap-2.5 md:gap-3.5">
        <div className="flex flex-nowrap items-center justify-between gap-x-3 gap-y-2">
          <h1 className="min-w-0 flex-1 truncate font-display text-[22px] leading-[1.15] text-[#F3EDE2] md:whitespace-normal md:text-[32px]">
            {question}
          </h1>
          <Link
            href={actionHref}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#AFC2DC] bg-accent-button px-3.5 text-[13px] font-semibold text-on-accent md:h-12 md:gap-2 md:px-5 md:text-sm"
          >
            {actionIcon}
            {actionLabel}
          </Link>
        </div>
        <form
          className="flex items-center gap-2 rounded-2xl bg-white py-1.5 pl-4 pr-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.18)] md:gap-2.5 md:py-2 md:pl-5 md:pr-2"
          onSubmit={submit}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted md:text-base"
          />
          <DictationMicButton
            variant="round"
            onTranscript={(text) =>
              setDraft((current) =>
                current.trim() ? `${current.trim()} ${text.trim()}` : text.trim(),
              )
            }
          />
          <button
            type="submit"
            aria-label="Start with this"
            disabled={!draft.trim()}
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#0F1B2D] text-white disabled:cursor-default disabled:opacity-40 md:size-[42px]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
        <div className="-mx-4 flex flex-nowrap items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
          <span className="mr-0.5 shrink-0 text-[12.5px] text-[rgb(243_237_226_/_0.55)]">
            {promptLabel}
          </span>
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPrompt(prompt)}
              className="inline-flex h-[30px] shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border border-[rgb(243_237_226_/_0.18)] bg-[rgb(243_237_226_/_0.08)] px-3 text-[12.5px] text-[rgb(243_237_226_/_0.85)]"
            >
              {prompt}
            </button>
          ))}
        </div>
        {links && links.length > 0 ? <OverviewHeroLinks links={links} /> : null}
      </div>
    </section>
  );
}

function OverviewHeroLinks({ links }: { links: readonly OverviewHeroLink[] }) {
  return (
    <>
      <div
        className="hidden gap-2.5 border-t border-[rgb(243_237_226_/_0.12)] pt-3.5 md:flex"
        role="navigation"
        aria-label="Sections"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border border-[rgb(243_237_226_/_0.16)] bg-[rgb(243_237_226_/_0.07)] px-3.5 py-3 text-[#F3EDE2]"
          >
            <span className="flex shrink-0 text-[#D9B87C]" aria-hidden>
              {link.icon}
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate text-[15px] font-semibold">{link.label}</span>
              {typeof link.count === "number" ? (
                <span className="text-[13px] text-[rgb(243_237_226_/_0.6)]">{link.count}</span>
              ) : null}
            </span>
            <SelectChevron direction="right" className="text-[rgb(243_237_226_/_0.6)]" />
          </Link>
        ))}
      </div>
      <nav
        className="flex h-10 overflow-hidden rounded-[12px] border border-[rgb(243_237_226_/_0.16)] bg-[rgb(243_237_226_/_0.07)] md:hidden"
        aria-label="Sections"
      >
        {links.map((link, index) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[#F3EDE2] ${
              index > 0 ? "border-l border-[rgb(243_237_226_/_0.16)]" : ""
            }`}
          >
            <span className="flex shrink-0 text-[#D9B87C]" aria-hidden>
              {link.icon}
            </span>
            <span className="truncate text-[13.5px] font-semibold">{link.label}</span>
            {typeof link.count === "number" ? (
              <span className="text-xs text-[rgb(243_237_226_/_0.55)]">{link.count}</span>
            ) : null}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function OverviewSection({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col gap-2.5 rounded-[22px] border border-border bg-card px-4 pb-5 pt-5 shadow-[0_2px_14px_rgba(15,27,45,0.05)] md:gap-4 md:px-[22px] md:pb-[22px] ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.09em] text-accent-link md:hidden">
            {title}
          </h2>
          <h2 className="hidden font-display text-[22px] text-foreground md:block md:text-2xl">
            {title}
          </h2>
          {subtitle ? <p className="text-sm text-foreground/80">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function OverviewOutlineLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-[38px] shrink-0 items-center gap-1 rounded-full border border-border bg-card pl-4 pr-2.5 text-sm font-semibold text-foreground"
    >
      {children}
      <SelectChevron direction="right" />
    </Link>
  );
}
