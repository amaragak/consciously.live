import { useState, type FormEvent, type ReactNode } from "react";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { SelectChevron } from "@/components/select-chevron";
import { Link } from "@/lib/spa-nav";

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
      className="relative flex flex-col gap-3.5 overflow-hidden rounded-[22px] px-5 py-5 shadow-[0_12px_34px_rgba(15,27,45,0.18)] md:px-7 md:pb-[22px] md:pt-6"
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
      <div className="relative flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <h1 className="font-display text-[26px] leading-[1.15] text-[#F3EDE2] md:text-[32px]">
            {question}
          </h1>
          <Link
            href={actionHref}
            className="inline-flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[#AFC2DC] bg-accent-button px-5 text-sm font-semibold text-on-accent"
          >
            {actionIcon}
            {actionLabel}
          </Link>
        </div>
        <form
          className="flex items-center gap-2.5 rounded-2xl bg-white py-2 pl-5 pr-2 shadow-[0_6px_18px_rgba(0,0,0,0.18)]"
          onSubmit={submit}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
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
            className="inline-flex size-[42px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#0F1B2D] text-white disabled:cursor-default disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-0.5 text-[12.5px] text-[rgb(243_237_226_/_0.55)]">
            {promptLabel}
          </span>
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPrompt(prompt)}
              className="inline-flex h-[30px] cursor-pointer items-center whitespace-nowrap rounded-full border border-[rgb(243_237_226_/_0.18)] bg-[rgb(243_237_226_/_0.08)] px-3 text-[12.5px] text-[rgb(243_237_226_/_0.85)]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OverviewSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[22px] border border-border bg-card px-4 pb-5 pt-5 shadow-[0_2px_14px_rgba(15,27,45,0.05)] md:px-[22px] md:pb-[22px]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-display text-[22px] text-foreground md:text-2xl">{title}</h2>
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
