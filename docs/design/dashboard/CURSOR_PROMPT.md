# Cursor prompt: revised logged-in dashboard (Home)

Paste everything below the line into Cursor (Agent mode). Put `docs/design/dashboard/` in the repo first so Cursor can read the mock-up.

---

## Goal

Revise the logged-in **Home dashboard** so it feels personal and purposeful rather than a list of counts: it reminds people who they're becoming, gives them one meditation to press play on, ties today's tasks to their goals, and summarises Manifest the way it's actually structured.

**Scope: the Home dashboard and the app sidebar only.** Don't redesign any other page.

Design reference: `docs/design/dashboard/Dashboard.dc.html` (desktop, 1440px wide). It's a design-tool file: the layout, hierarchy and copy are the spec; treat it as a spec, not code to paste. Its content (the studio goal, the meditation titles, the values) is example data. Everything shown must come from the user's real data.

## Step 0: investigate first, then tell me the plan before editing

1. Find the Home dashboard page and its components, the sidebar component, and the data each section uses today (greeting, streaks, Today dailies, meditation library and play history, journal entries, Manifest: manifesto, values, vision board, life areas, goals and their steps/to-dos).
2. For each section below, tell me which data already exists and which doesn't. **Don't invent backend features.** Where data is missing, use the fallback given, or hide that element and tell me.
3. Reply with a short plan and **wait for my OK**.

## Rules

- **Colours: use the existing theme tokens as they are.** I'm editing the colour scheme separately, so don't add, rename or change any colour tokens. Hex values in the mock-up are approximations: map each one to the nearest existing token.
- Use the existing fonts, logo component, icons and the paisley background asset. No new UI libraries.
- Keep every existing link a section currently offers, reachable either from the sidebar or from the section's single primary action. Nothing becomes unreachable.
- Every section needs a sensible **empty state** (new user, no data yet). The empty states are listed below.
- TypeScript, no `any`. Follow the repo's conventions. Light and dark themes must both work.

## Sections (top to bottom)

**1. Greeting + manifesto**
- Keep the time-of-day greeting ("Good afternoon, Alex.").
- Underneath: the user's manifesto line in italic Fraunces, plus a small link chip to their current focus goal ("Becoming · {goal} →").
- Empty: no manifesto → "Write your manifesto →" linking to it. No goal → hide the chip.
- Remove the "Pick up where you left off — or start something new." subline.

**2. "Ready when you are" card** (dark card, left, ~7/12 width)
- One meditation to press play on, **played from the start**. There's no resume or progress; meditations are meant to be heard whole.
- Pick it in this order, using only data that exists: (a) the newest meditation the user created that they haven't played yet; (b) otherwise, the meditation linked to their current goal, if meditations are linked to goals; (c) otherwise, their most recently created meditation.
- Shows: play button, title, "{style} · {duration}" and, if known, what it was made from ("made from your goal", "made from your journal"). Plus a decorative waveform.
- Empty: no meditations → "Create your first meditation" + a button to Meditate → Create.

**3. Today card** (right, ~5/12 width)
- Header: "Today · {date}" and, on the right, **one streak**: "{n}-day streak · {done} of 3 done". Use the existing streak that counts days with at least one daily done (currently called "partial streak"). Remove the "full streak" display from Home; keep its data, and show it in Insights if it's already there. Never lead with a zero: if the streak is 0, show just "{done} of 3 done".
- The same three dailies as today, with context sublines and an action on the right:
  - Add a gratitude → "Add →" (opens Journal → Gratitudes)
  - Do a meditation, subline "Try: {the meditation from card 2}" → "Play →"
  - Next step on your goal, subline "{next incomplete step} · {goal}" → "Focus →" (opens Focus with that step pre-selected if Focus supports it; otherwise just opens Focus). This replaces the generic "Make progress on a life area"; if the user has no goals, fall back to the current wording.
- Completed items show a filled check; keep the existing completion logic.

**4. Meditate and Journal** (two cards side by side)
- **Meditate:** label "MEDITATE", a link "Library ({count}) →", heading "What do you need right now?", the two most recently **played** meditations with "Played {relative day}" and duration (if play history isn't tracked, use the two most recent in the library and label them "Recent"), and one primary button, "+ Create a meditation". Remove the My Creations / Programs / Community pill links (they're in the sidebar).
- **Journal:** label "JOURNAL", heading "How are you, really?", the two most recent entries showing **title and date only** (no entry text), a "Show previews" toggle (off by default; remember the choice per user; client-side is fine) that reveals a one-line preview, and one button, "+ New entry". **Hide empty entries** from this list. Remove the Entries / Gratitudes / Insights pill links.
- Empty: "Your first meditation is one prompt away" / "Write your first entry", each with its button.

**5. Manifest card** (full width). It must follow the real hierarchy: **Manifest → life areas → goals**.
- Header: "MANIFEST" + "Open Manifest →".
- **Manifest-wide row:** "Your vision board" (the first 4 images as tiles) and "Your values" (chips). These are not tied to any goal.
- **"Your life areas" row** (below a divider): one card per life area (up to 3, then "+ {n} more →"). Each shows the area name, its active goal ("Goal · {goal}"), "Next: {next incomplete step}", a progress bar and "{done} of {total} steps". The whole card links to that life area.
- Empty: no vision board → "Start your vision board →"; no values → hide the chips; no life areas → "Map your life areas →".

## Sidebar

- Keep the current structure and every link. Under Manifest: Overview, Vision board, Manifesto (if that page exists), then a small muted subheading **"Your life areas"** with the user's life areas listed under it, so they read as the user's data, not as navigation.
- Show "Pro" as a small badge next to the user's name instead of a separate button; keep what it links to.
- Leave the "Hybrid" control's behaviour unchanged, but give it a clear label or tooltip saying what it switches (tell me what it does if it isn't obvious from the code).

## Header

- Remove the "VIEW MARKETING PAGE →" button for normal users. Keep it for admins only if it's useful to you.

## Visual polish

- Fade the paisley on Home to a faint, cropped corner (like the sign-up page), so it never sits behind text or numbers.
- Check contrast: the small uppercase section labels and grey helper text must reach 4.5:1 on their background in both themes. Darken the tokens' usage (e.g. a darker accent shade for text) rather than changing token values.
- Keep one elevated surface style for cards. Meditate may keep a soft accent tint as the core feature; everything else uses the standard card.

## Mobile (< 768px)

Single column in this order: greeting + manifesto → Ready when you are → Today → Meditate → Journal → Manifest (vision board tiles as a 2×2 grid, values chips, then life area cards stacked). The sidebar becomes the existing mobile nav.

## Done when

- Home matches the mock-up's layout and hierarchy with real data, in light and dark themes, on desktop and mobile.
- Every section has a working empty state (test with a new account).
- No colour tokens were added or changed.
- Nothing that was reachable from Home before is now unreachable.
- Typecheck, lint and build pass. List every file you changed, which fallbacks you used (and why), and any element you hid because the data doesn't exist yet.
