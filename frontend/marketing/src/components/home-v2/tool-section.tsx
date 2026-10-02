import Link from "next/link";
import type { HomeV2ToolId } from "@/components/home-v2/constants";
import { HOME_V2_TOOLS } from "@/components/home-v2/constants";
import { HomeV2ToolIcon } from "@/components/home-v2/home-v2-tool-icon";
import { Lockup } from "@/components/home-v2/lockup";
import { HOME_TOOL_VIGNETTES } from "@/components/home-v2/tool-vignettes";

const COPY: Record<HomeV2ToolId, { h2: string; body: string }> = {
  meditate: {
    h2: "Feel it before it’s real.",
    body: "Guided meditations written from your own words — your goals, your journal, today’s worries — so every session speaks to exactly where you are.",
  },
  journal: {
    h2: "Hear what you’ve been telling yourself.",
    body: "Write or speak freely. Consciously surfaces the patterns: the doubts that keep returning, and the dreams that won’t go away.",
  },
  manifest: {
    h2: "Know exactly who you’re becoming.",
    body: "Build your vision board, write your personal manifesto, and turn each goal into next steps you can actually take.",
  },
  focus: {
    h2: "Give your hours to your dream.",
    body: "A focus timer built around the goals you set in Manifest. Pick a step, start the timer, and distracting sites stay blocked until the session ends.",
  },
  chat: {
    h2: "Never stuck in your own head.",
    body: "A coach that listens, reflects and acts: logging a win, adding a step, or starting a meditation the moment you need one.",
  },
};

type Props = {
  tool: HomeV2ToolId;
  visualLeft?: boolean;
};

export function ToolSection({ tool, visualLeft = false }: Props) {
  const meta = HOME_V2_TOOLS.find((t) => t.id === tool)!;
  const copy = COPY[tool];

  const text = (
    <div
      className="flex flex-1 basis-0 flex-col gap-3 md:gap-[22px]"
      data-hv2-reveal
    >
      <Lockup tool={meta.label} size="eyebrow" onNavy />
      <h2 className="home-v2-display m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.6px] md:text-[56px] md:leading-[1.05] md:tracking-[-1px]">
        {copy.h2}
      </h2>
      <p className="m-0 text-[15px] leading-[1.55] text-[var(--hv2-body)] md:text-[19px] md:leading-[1.6]">
        {copy.body}
      </p>
      <Link
        href={meta.href}
        className="inline-flex min-h-8 items-center self-start py-1.5 pb-1 text-[15px] font-semibold text-[var(--hv2-gold)] md:hidden"
      >
        {meta.ctaLabel} →
      </Link>
      <Link
        href={meta.href}
        className="accent-fill-gradient hidden items-center gap-2 self-start rounded-full px-6 py-3 text-[17px] font-semibold transition-opacity hover:opacity-90 md:inline-flex"
      >
        <HomeV2ToolIcon tool={tool} />
        {meta.ctaLabel}
      </Link>
    </div>
  );

  const visual = (
    <div className="w-full md:w-[540px] md:shrink-0" data-hv2-reveal>
      {HOME_TOOL_VIGNETTES[tool]}
    </div>
  );

  return (
    <section
      id={`tool-${tool}`}
      data-tool={tool}
      className="w-full border-t border-[var(--hv2-hero-hairline)] px-5 py-10 md:border-t-0 md:px-[min(120px,8vw)] md:py-24"
    >
      <div
        className={`mx-auto flex w-full max-w-[1200px] flex-col items-stretch gap-3 md:items-center md:gap-[80px] ${
          visualLeft ? "md:flex-row-reverse" : "md:flex-row"
        }`}
      >
        {text}
        {visual}
      </div>
    </section>
  );
}
