# Cursor prompt: new Consciously homepage (v2) + "Previous versions" in the profile menu

Paste everything below the line into Cursor (Agent mode). Put the three reference files in `docs/design/homepage-v2/` first so Cursor can read them.

---

## Goal

Add a redesigned marketing homepage as a **new page file**. Replace nothing: every existing page component stays byte-for-byte as it is. The current homepage and the current tool pages (/meditate, /journal, /manifest, /focus, /chat) must stay reachable as "previous versions" from the profile menu that opens when a logged-in user clicks their profile icon.

Design references (read both before writing code):
- `docs/design/homepage-v2/Main.dc.html`: the full desktop page, 1440px wide. It is a design-tool file: `{{accent}}` = `#C8A46A`, `<sc-for>` = map over the arrays in the `<script>` block at the bottom, inline styles = the exact values to match. Treat it as a spec, not code to paste.
- `docs/design/homepage-v2/HeaderScroll.dc.html`: the sticky-header behaviour (logic in the script block).

## Step 0: investigate first, then tell me the plan before editing

1. Find the router (App Router `app/` or Pages `pages/`), the current homepage file, the tool page files, the styling approach (Tailwind / CSS modules / styled-components …), how fonts are loaded, and the component that renders the profile-icon dropdown on the logged-in site.
2. Record where every link on the **current** homepage and nav goes today (each tool, Sign up / Start free, Sign in, Connect, Read, footer). Those are the link targets for v2 (see "Links" below).
3. Reply with a short plan (files to add, the few existing files you must touch and why) and **wait for my OK**.

## Rules

- **New files only for the new design.** Put it under `components/home-v2/` (or the repo's equivalent), split into section components: `HomeV2Page`, `HeroSection`, `ToolLoopSection`, `ToolSection` (reused five times), `TypesSection`, `FinalCta`, `SiteFooterV2`, `StickyToolHeader`.
- **Don't rewrite old code.** Where a route file has to change so `/` renders v2, move the old homepage body *verbatim* into `components/legacy/LegacyHome.tsx` (same JSX, same imports, no refactors), then render it at `/legacy`. Old tool pages: add `/legacy/meditate`, `/legacy/journal`, `/legacy/manifest`, `/legacy/focus`, `/legacy/chat`, each a thin route that renders the **existing** page component unchanged. That way, when a tool page is redesigned later, its old version already has a home.
- Put the swap behind one flag so I can roll back in one line: `NEXT_PUBLIC_HOME_V2=true` → `/` renders v2; false → `/` renders the old home. Default true.
- **Links: keep current behaviour.** Every link in v2 goes exactly where the equivalent link on the current site goes today: same href, same component (`Link` etc.), same auth or guest handling. Don't invent new URLs or domains. Where v2 has a link with no current equivalent, reuse the closest existing target and list it in your summary.
- The current "Preview app as guest" button is a dev-only tool. Leave it out of v2 entirely (it can stay on the legacy page).
- Use the repo's existing styling approach and conventions. No new UI libraries. TypeScript, no `any`.
- Don't touch auth, the API or the infra config.

## Profile menu

In the existing profile-icon dropdown, add a group at the bottom, below a divider:

**Previous versions**
- Old homepage → `/legacy`
- Old Meditate → `/legacy/meditate`
- Old Journal → `/legacy/journal`
- Old Manifest → `/legacy/manifest`
- Old Focus → `/legacy/focus`
- Old Chat → `/legacy/chat`

Style it like the existing menu items (smaller, muted label for the group heading). Keyboard accessible like the other items. Don't reorder or restyle anything else in the menu. The `/legacy/*` pages keep whatever auth rules their originals have.

## Design system

Colours (make them tokens / CSS variables):
- `--navy: #0F1B2D` (dark sections); `--navy-2: #1A2A44` (cards on navy)
- `--ivory: #F6F1E7` (page background); `--sand: #EFE6D3`; `--line: #E6DDCB`; `--line-soft: #EFE7D6`
- `--gold: #C8A46A` (accent: buttons, highlights on navy)
- `--tan-text: #8A6A34` (gold-family **text on light backgrounds**; `--gold` fails contrast there)
- `--ink: #0F1B2D`; `--body: #4A4F5A`; `--muted: #6B6457`
- On navy: body text `rgba(246,241,231,0.78)`, muted `0.6`, hairlines `0.12–0.2`

Type:
- Display: **Fraunces** (variable, italic axis). Headings weight 350–400, tight negative tracking.
- Body: **Instrument Sans** 400/500/600. Load both via `next/font/google` (or the repo's existing font method).
- Scale (desktop → mobile): H1 92/1.0 → 50/1.0; section H2 52/1.08 → 30/1.1; loop H2 60 → 34; body 19/1.6 → 16; hero sub 21 → 17.

Shape: pill buttons (radius 999), cards 18–24px radius, 1px `--line` borders on light cards. No shadows, gradients or emoji. Icons: inline stroke SVG.

Layout: max content width 1200 (120px side padding at 1440); 140px between sections; ≤768px → single column, 20px gutters.

## The wordmark lockup (brand rule)

Every tool is a verb, and it reads after the wordmark: `consciously` in Fraunces, then the tool name in *italic* Fraunces in accent colour, e.g. "consciously *Meditate*". Build a `<Lockup tool?>` component. Use it for:
- each tool section's eyebrow (light sections: "consciously" in `--muted`, verb in `--tan-text`)
- the five tool cards
- the sticky header

## Sticky header (`StickyToolHeader`)

- Hidden while the hero is on screen; slides down (translateY -100% → 0, 260ms ease) once the user scrolls past ~140px. Respect `prefers-reduced-motion` (no slide, just show).
- 72px tall, `rgba(15,27,45,0.94)` background, 1px bottom hairline.
- Left: the lockup. When a tool section is active it reads "consciously *Meditate*" etc.; on the hero, the "Five tools" band and the final CTA it reads just "consciously".
- Centre: nav links Meditate · Journal · Manifest · Focus · Chat │ Listen · Read · Connect (same set as the top nav, so nothing disappears on scroll). The tool links scroll to their section on the page. **Hide the active tool's link** (e.g. no "Meditate" link while the Meditate section is active), since the wordmark already reads "consciously *Meditate*"; the other links close the gap. Side padding drops to 80px so it all fits on one line.
- Right: "Sign in" + CTA button. The CTA label follows the active tool (Meditate "Create a meditation", Journal "Write an entry", Manifest "Build your vision board", Focus "Start a focus session", Chat "Talk to your coach"), going wherever that tool's current link goes; otherwise "Start free" (the current Sign up / Start free target).
- Detection: `IntersectionObserver` on section elements with `data-tool="meditate|journal|manifest|focus|chat"`. Active = the last section whose top has crossed 40% of the viewport height. No scroll-event polling.
- The wordmark's accessible name stays "Consciously home"; don't announce the verb changes.
- Mobile: the same behaviour on the compact header (wordmark + lockup, "Start free", menu button). Hide the centre links.

## Scroll animation

Reference: the CSS at the top of `HeaderScroll.dc.html`.
- **Hero, on load:** the H1, sub, prompt box and the four cards ease up in sequence (24px, 900ms, 150ms stagger, `cubic-bezier(.2,.7,.2,1)`).
- **Each section, on scroll:** its children fade up (opacity 0 → 1, translateY 40px → 0) as the section enters the viewport. The text column goes first and its mock-up follows slightly later.
- **"Five tools" diagram:** the cards cascade left to right (Journal, +, Manifest, →, Meditate, →, Focus), then the Chat bar.
- Implement with `IntersectionObserver` toggling a class (works everywhere). Optionally enhance with CSS scroll-driven animations (`animation-timeline: view()`) where supported. Animate each element once, not every time it re-enters.
- Content must be visible without JS: only hide elements once the observer is set up.
- `prefers-reduced-motion: reduce` → no motion, everything shown immediately. No scroll-jacking; smooth scrolling only for the nav anchor links.

## Page content (in order, copy exact)

**1. Hero** (navy)
- Top nav, 96px: wordmark · Meditate Journal Manifest Focus Chat │ Listen Read Connect · Sign in · [Start free]. The five tool links scroll to their sections on this page (anchor links to the `data-tool` sections; smooth scroll unless reduced motion). The section action links, cards and buttons are what go into the app. No Pricing link (pricing lives in the sign-up step). Listen, Read and Connect go wherever those links go on the current site (Listen = the community meditation library).
- H1: "Become who you *said* you'd be." ("said" italic, gold)
- Sub: "Personalised AI-guided meditations, vision boarding, a goal planner, your personal manifesto and focus sessions — everything you need to turn the dream into your daily life. *Live consciously.*" (the last two words in italic Fraunces, ivory, as the payoff; this is what makes the consciously.live domain make sense)
- Prompt box (the meditation generator; replaces the old primary button): one-line pill spanning the full content width (1200px), gold hairline. Input with visually hidden label "What would you like a meditation for?", placeholder "Calm before my big pitch, confidence for launch day, deeper sleep…", and a submit button [Create my meditation] inside the pill. Under it, a small line: "Any intention, any moment: a guided meditation written and voiced just for you." On submit: follow the current create-meditation / sign-up flow and carry the typed prompt through sign-up (store it; after login, pre-fill the create-meditation input) so the user never retypes it. If the current flow can't take a pre-filled prompt, say so in your summary.
- Below that (72px gap), label "OR START SOMEWHERE ELSE", then a 4-column grid of larger link cards (translucent on navy, 20px radius), each with a Fraunces title, one line of description and a small gold "{Tool} →". Each goes to the current link target for that tool (via sign-up if logged out). No meditation card, since the box covers that.
  - Build your vision board: "Picture the life you're creating, write your manifesto and set your goals." · Manifest →
  - Write in your journal: "Write or speak freely, and see the patterns in how you feel over time." · Journal →
  - Start a focus session: "A timer for the steps towards your goals, with distracting sites blocked." · Focus →
  - Talk to your coach: "Think out loud, and let it log, plan or start a meditation for you." · Chat →
  - Mobile: the same four as a 2×2 grid with shorter lines.
- Layout: full width. The H1 (112px) opens the hero, 72px below the nav, across the page, then the sub at full content width, the prompt box and its helper line, then the "Or start somewhere else" cards. Nothing else in the hero.

**2. "Five tools. One direction."** (its own colour band: sand `#EFE6D3`, full bleed, then 140px gap before the next section)
- Row: H2 "Five tools. One direction." on the left; on the right the body "Every entry, session and conversation moves you towards the same place: the life you’ve chosen."
- Diagram showing all five tools, each card headed by its lockup ("consciously *Journal*" etc.):
  - Row 1: [white **Journal** card: italic "I can see the business so clearly. Why do I keep waiting to begin?" · "Tonight's entry"] **+** [white **Manifest** card: "Someone living the life they designed." · "Goal · Open my own studio"] **→** [navy **Meditate** card, slightly wider: gold play button, "Manifesting your business: living as its successful owner, today", short waveform, "Written from both · Warm voice · Soft rain"] **→** [white **Focus** card: timer ring "25:00" + "Price the first collection" · "Focus timer · from your Manifest goal"]
  - Row 2, full width: navy **Chat** bar: lockup · "Runs through all of it: ask, reflect, and it moves the app for you." · two small bubbles, "I keep doubting myself." → "Want a meditation for that?"
- Mobile: Journal + Manifest side by side → down arrow → Meditate → down arrow → Focus ("Price the first collection" · "Focus timer · from your Manifest goal") → Chat card. Each mobile card links to its tool (no separate tool rows).

**3–7. Tool sections** (alternate sides: text-left, visual-left, text-left, visual-left, text-left). Each: lockup eyebrow, H2, 1–2 sentences of body, an action link (2px gold underline) to the current target for that tool: Meditate "Create a meditation →", Journal "Write your first entry →", Manifest "Build your vision board →", Focus "Start a focus session →", Chat "Talk to your coach →", plus a 540px vignette with minimal text. Copy each vignette exactly from `Main.dc.html`.
- **Meditate**: "Feel it before it’s real." / "Guided meditations written from your own words — your goals, your journal, today’s worries — so every session speaks to exactly where you are." Vignette: input → output, to show how personal it gets.
  - White "YOU ASK" card: italic "I want to manifest opening my new studio." · style pills (Manifestation selected, Visualization, Sleep).
  - Down arrow.
  - Navy "YOU GET" card: gold play button, title "Opening day at your new studio", "Manifestation · Warm voice · Soft rain", waveform. No script excerpt.
- **Journal**: "Hear what you’ve been telling yourself." / "Write or speak freely. Consciously surfaces the patterns: the doubts that keep returning, and the dreams that won’t go away." Vignette: navy "TODAY’S ENTRY" card with italic "I can picture the studio so clearly. But who am I to charge for this? Grateful for a quiet morning to dream." (the three phrases gold-underlined) → down arrow → white "PATTERNS THIS MONTH" card with 3 labelled bars (Vision 78%, Self-doubt 52%, Gratitude 36%) + "Turn into a meditation →".
- **Manifest**: "Know exactly who you’re becoming." / "Build your vision board, write your personal manifesto, and turn each goal into next steps you can actually take." Vignette (navy): "VISION BOARD" with a row of 4 image tiles (placeholder colour blocks for now, real images later) · "MANIFESTO" + italic "I trust my vision and act on it every day." · divider · "Open my own studio" + 3 stacked steps (● Price the first collection · ○ Find a studio space · ○ Open the online shop).
- **Focus**: "Give your hours to your dream." / "A focus timer built around the goals you set in Manifest. Pick a step, start the timer, and distracting sites stay blocked until the session ends." Vignette: timer ring 18:24 + "Price the first collection" + "From Manifest · Open my own studio · step 1 of 3" + "Distracting sites blocked".
- **Chat**: "Never stuck in your own head." / "A coach that listens, reflects and acts: logging a win, adding a step, or starting a meditation the moment you need one." Vignette: "I keep doubting myself." → "Want a meditation for that?" + "▸ Start meditation" pill.

**8. Final CTA** (navy rounded panel): H2 "Who are you becoming?" + line "Start today. It’s free." + [Start free] (the current "Start free" target).

**9. Footer**: wordmark · Listen, Read, Connect, Instagram (@consciously.live) · © 2026 Consciously.

**Mobile (≤768px)**: single column, same order and copy. The tool sections stack with the vignette under the text.

## Accessibility & quality

- Real `<a>`/`<button>` elements. Visible focus rings (gold outline). Touch targets ≥ 44px.
- Contrast: gold text only on navy; on ivory use `--tan-text`.
- Vignettes are decorative: `aria-hidden` on the fake UI, but keep the real section headings and links accessible.
- Semantic landmarks (`header`, `nav`, `main`, `section` with headings, `footer`). One `h1`.
- Add page metadata: title "Consciously — become who you said you'd be", description "Get clear on the life you want, quiet the doubt in the way, and spend your days building it."
- No layout shift from fonts (`display: swap` + fallback metrics via next/font).

## Done when

- `/` renders v2 with the flag on and the old home with it off. `/legacy` and `/legacy/{tool}` render the untouched originals.
- The profile menu shows "Previous versions" with working links.
- Sticky header lockup and CTA switch correctly across all five sections, on desktop and mobile.
- Scroll animations run once per element, and are off with reduced motion.
- Typecheck, lint and build pass. List every file you added and every existing file you touched (the touches should be only: the root route file, the profile menu, and the font/layout setup if needed).
- Give a table of every v2 link and the existing target it reuses, flagging any v2 link that had no current equivalent.
