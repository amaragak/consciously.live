import Link from "next/link";
import {
  IconHeartHandshake,
  IconMessageCircle,
  IconSparkles,
  IconTopologyStar3,
} from "@tabler/icons-react";

const cards = [
  {
    title: "Life coaching",
    body: "Bring the hard questions — purpose, relationships, rest, grief, what’s next. A wise, compassionate ear that stays with you.",
    Icon: IconHeartHandshake,
  },
  {
    title: "Do things in the app",
    body: "Log a gratitude, add a task to a life area, or open Create Meditation — without hunting through menus.",
    Icon: IconSparkles,
  },
  {
    title: "Knows your tools",
    body: "Journal, Ideate, Meditate, Sounds, and Focus aren’t separate worlds. Chat can point you to the right one when it helps.",
    Icon: IconTopologyStar3,
  },
  {
    title: "Talk it through",
    body: "Vent, reflect, or simply say “I don’t know what I need.” Presence first — actions only when they serve you.",
    Icon: IconMessageCircle,
  },
] as const;

/**
 * Chat marketing page at `/chat`. App lives at `/chat/my`.
 */
export function EnhancedChatPage() {
  return (
    <div className="w-full">
      <section className="home-hero home-hero--product w-full px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
          <p className="font-display text-2xl font-medium tracking-tight text-marketing-ink sm:text-3xl">
            Chat
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-3xl font-medium leading-tight tracking-tight text-marketing-ink sm:text-4xl md:text-[2.75rem]">
            A life coach that can also move the app.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-marketing-body sm:text-lg">
            Talk through what&apos;s heavy — or ask Consciously to log a
            gratitude, shape a next step, or start a meditation. One
            conversation for reflection and action.
          </p>

          <ul className="mt-10 grid w-full max-w-6xl grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {cards.map(({ title, body, Icon }) => (
              <li key={title} className="min-h-0">
                <div className="flex h-full flex-col rounded-2xl border border-marketing-card-border bg-marketing-card-bg p-5 text-left shadow-[var(--marketing-card-shadow)] sm:p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-marketing-icon-bg text-marketing-icon-fg">
                    <Icon size={22} stroke={1.75} aria-hidden />
                  </span>
                  <p className="mt-4 font-display text-lg font-semibold tracking-tight text-marketing-ink">
                    {title}
                  </p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-marketing-body">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="w-full bg-marketing-band-a px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink sm:text-4xl">
            Presence first. Tools when they help.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-marketing-muted sm:text-lg">
            Share what&apos;s on your mind without rushing to a fix. When a
            small action would serve you — a gratitude line, a task on a life
            area, a guided session — Chat can do it in place, still in the same
            thread.
          </p>
        </div>
      </section>

      <section className="w-full bg-marketing-band-b px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink sm:text-4xl">
            Open Chat.
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-marketing-muted">
            Sign in to talk with Consciously — coach and companion across your
            journal, ideas, focus, and meditations.
          </p>
          <div className="mt-8">
            <Link
              href="/chat/my"
              className="inline-flex items-center justify-center rounded-full accent-fill-gradient px-7 py-3 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              Chat
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
