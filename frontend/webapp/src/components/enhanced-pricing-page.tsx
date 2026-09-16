import Link from "next/link";

type Tier = {
  id: string;
  name: string;
  blurb: string;
  price: string;
  priceNote: string;
  cta: string;
  href: string;
  popular?: boolean;
  features: string[];
  excluded?: string[];
};

const tiers: Tier[] = [
  {
    id: "essentials",
    name: "Essentials",
    blurb: "Reflect, plan, and focus — plus listen to community and program sessions.",
    price: "Free",
    priceNote: "No personal meditation generation",
    cta: "Get started",
    href: "/journal/my",
    features: [
      "Journal — entries, gratitudes, insights",
      "Manifest — life areas, vision, goals",
      "Focus — stay with one thing",
      "Community & program meditations",
      "Library listening for shared sessions",
    ],
    excluded: ["Personal meditation generation", "Chat"],
  },
  {
    id: "create",
    name: "Create",
    blurb: "Everything in Essentials, plus make your own guided meditations.",
    price: "—",
    priceNote: "Most popular · pricing soon",
    cta: "Start creating",
    href: "/meditate/create",
    popular: true,
    features: [
      "Everything in Essentials",
      "Generate personal meditations",
      "Create from type, chat, journal, ideate, or prompt",
      "Your private library of creations",
      "Voices & sound mixes for your sessions",
    ],
    excluded: ["Chat companion"],
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "Chat across the suite, plus room for more personal generations.",
    price: "—",
    priceNote: "Chat + higher generation limits",
    cta: "Go Pro",
    href: "/chat/my",
    features: [
      "Everything in Create",
      "Chat — reflect and act in one thread",
      "Extra personal meditation generations",
      "Priority when the queue is busy",
    ],
  },
];

/**
 * Pricing marketing page at `/pricing`.
 */
export function EnhancedPricingPage() {
  return (
    <div className="w-full">
      <section className="home-hero home-hero--product w-full px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
          <p className="font-display text-2xl font-medium tracking-tight text-marketing-ink sm:text-3xl">
            Consciously
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-3xl font-medium leading-tight tracking-tight text-marketing-ink sm:text-4xl md:text-[2.75rem]">
            Simple plans for how you show up.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-marketing-body sm:text-lg">
            Start with reflection and listening. Create when you want sessions
            made for you. Pro unlocks Chat and more generations.
          </p>

          <ul className="mt-12 grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch lg:gap-5">
            {tiers.map((tier) => (
              <li key={tier.id} className="min-h-0">
                <div
                  className={`relative flex h-full flex-col rounded-2xl border p-6 text-left shadow-[var(--marketing-card-shadow)] sm:p-7 ${
                    tier.popular
                      ? "border-gold/70 bg-marketing-card-bg ring-1 ring-gold/40"
                      : "border-marketing-card-border bg-marketing-card-bg"
                  }`}
                >
                  {tier.popular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1E2530] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#FAF8F3] dark:bg-marketing-ink dark:text-home-hero-bg">
                      Most popular
                    </span>
                  ) : null}
                  <p className="font-display text-xl font-semibold tracking-tight text-marketing-ink">
                    {tier.name}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-marketing-body">
                    {tier.blurb}
                  </p>
                  <p className="mt-6 font-display text-3xl font-medium tracking-tight text-marketing-ink">
                    {tier.price}
                  </p>
                  <p className="mt-1 text-xs text-marketing-muted">{tier.priceNote}</p>

                  <ul className="mt-6 flex-1 space-y-2.5">
                    {tier.features.map((f) => (
                      <li
                        key={f}
                        className="flex gap-2 text-sm leading-snug text-marketing-body"
                      >
                        <span className="mt-0.5 shrink-0 text-accent-link" aria-hidden>
                          ✓
                        </span>
                        <span>{f}</span>
                      </li>
                    ))}
                    {tier.excluded?.map((f) => (
                      <li
                        key={f}
                        className="flex gap-2 text-sm leading-snug text-marketing-muted/80"
                      >
                        <span className="mt-0.5 shrink-0" aria-hidden>
                          –
                        </span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    <Link
                      href={tier.href}
                      className={
                        tier.popular
                          ? "inline-flex w-full items-center justify-center rounded-full accent-fill-gradient px-5 py-3 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
                          : "inline-flex w-full items-center justify-center rounded-full border border-marketing-card-border bg-marketing-panel-bg px-5 py-3 text-sm font-semibold text-marketing-ink transition-opacity hover:opacity-90"
                      }
                    >
                      {tier.cta}
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="w-full bg-marketing-band-a px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink sm:text-4xl">
            What stays free to listen.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-marketing-muted sm:text-lg">
            Essentials includes community and program meditations so you can
            practice without generating. Personal creations unlock on Create;
            Chat and higher generation limits arrive with Pro.
          </p>
        </div>
      </section>

      <section className="w-full bg-marketing-band-b px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink sm:text-4xl">
            Questions about plans?
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-marketing-muted">
            Billing is still settling in. Explore the product now — paid Create
            and Pro checkout will land here when ready.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/meditate"
              className="inline-flex items-center justify-center rounded-full accent-fill-gradient px-7 py-3 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              Explore Meditate
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-marketing-muted underline-offset-2 hover:underline"
            >
              Back to Consciously
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
