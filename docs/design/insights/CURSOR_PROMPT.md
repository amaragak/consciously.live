# Cursor prompt: Journal Insights page (weekly letter + patterns)

Paste everything below the line into Cursor (Agent mode). Put `docs/design/insights/` in the repo first so Cursor can read the mock-up.

---

## Goal

Redesign the **Journal → Insights** page so the weekly letter reads like a real letter, and add a "Patterns this week" section under it: an emotion bar chart, a mood week and a "turn this into a meditation" action.

## Scope: only these two areas

1. **The Insights content area** (everything to the right of the letters list).
2. **The Insights sidebar** (the "Past letters" list on the left, to be renamed "Your letters").

**Do not touch** the main app header (including the "Journal › Insights" breadcrumb and the Journal / Gratitudes / Insights switcher), the main app sidebar, or any other page. They're being handled separately.

Design reference: `docs/design/insights/Insights.dc.html` (desktop, 1440px). It's a design-tool file: layout, hierarchy and copy are the spec; treat it as a spec, not code to paste. Ignore its header bar, which is only there for context. The letter text, scores and moods in it are example data.

## Step 0: investigate first, then tell me the plan before editing

1. Find the Insights page, the letters list, and how the weekly letter is generated and stored (the model call, prompt, response shape and table/model).
2. Find where journal entry mood tags (Calm / Good / Mixed / Low / Heavy) are stored, and whether meditations can be linked to a week.
3. Reply with a short plan, including the exact backend change for the emotion scores (below), and **wait for my OK**.

## Rules

- **Colours: use the existing theme tokens as they are.** I'm editing the colour scheme separately, so don't add, rename or change any tokens. Hex values in the mock-up are approximations: map each one to the nearest existing token. The mood colours should map to existing soft tints; if there aren't five distinct ones, tell me rather than adding tokens.
- Existing fonts and components; no new UI libraries. Light and dark themes must both work.
- Keep existing behaviour: generating a letter, viewing past letters, and anything currently under "Show more insights" (move it below the new Patterns section rather than dropping it).
- TypeScript, no `any`.

## The one backend change: emotion scores

Extend the **existing** letter-generation call (no new model call) so it also returns structured data alongside the letter text:

```json
{ "emotions": [ { "name": "Hope", "score": 8 }, ... ] }
```

- 3–5 emotions, each scored 0–10 for how strongly it came through in the week's entries; sorted high to low; short plain-English names.
- Store them with the letter. Older letters without scores simply hide the chart (no backfill needed).
- Validate the shape; if parsing fails, save the letter anyway and hide the chart.

## Insights sidebar: "Your letters"

- Heading "YOUR LETTERS" (small, muted, uppercase).
- One item per week, newest first: the date range in bold ("This week · 21–28 Sept", then "14–21 Sept"…) and the letter's first sentence in muted text, truncated to one line. This replaces the current "This week / This week" duplicate.
- Selected item: a white card with an accent left border (as now). Other items have no card, and a subtle background on hover.
- Surface: one step lighter than the main app sidebar, darker than the content (the same "list pane" surface as the Journal entries list).

## Content area (max width about 820px, centred)

**1. Title block**
- "WEEKLY REFLECTION" label, H1 "A gentle letter for {date range}", and a subline "Written from your {n} journal entries and {m} meditations this week" (omit the meditations part if they can't be counted per week).
- A "⋯" options button on the right holding the existing letter actions (e.g. regenerate) if there are any; otherwise leave it out.

**2. The letter**
- On a "paper" card (the lightest surface, 1px border, ~22px radius, generous padding: ~44px top, ~56px sides).
- Body in Fraunces (serif) at about 19px, line-height 1.7, max ~70 characters per line. The greeting ("Dear {name},") and the sign-off ("With you, · consciously") are in italic.

**3. "Patterns this week"** (H2, with a muted caption on the right: "From your mood tags and what you wrote")
- **Card 1, "How this week felt"** (full width, first): horizontal bars from the stored emotion scores. Each row is the name on the left, "{score}/10" on the right, and a 10px rounded bar. The top emotion uses the accent colour and the rest use the dark ink colour. Caption underneath: "Read from your entries by AI: a reflection, not a measurement."
- **Card 2, "Mood"** (full width, second): a Mon–Sun row. Each day is a short rounded block tinted by that day's mood tag with the mood **word inside** (so it doesn't rely on colour), plus the day name under it. Days without an entry get a dashed outline and "–"; today with no entry says "Today". If there are several entries in a day, use the most recent mood. One-line summary underneath, in plain words, generated with the letter if possible (e.g. "Mostly good, with a dip mid-week that eased by Friday"); otherwise leave it out.
- **Card 3, "Turn this week into a meditation"** (dark card): play icon, title, one line ("Written from your letter: …" using the top one or two emotions), and a "Create meditation" button. This opens the existing create-meditation flow pre-filled with a short prompt built from the letter; if that flow can't take a pre-fill, just open it and tell me.

**4. Empty state** (no letter yet this week)
- A dashed card: "BEFORE THE LETTER IS WRITTEN", "Your letter is written from this week's entries.", "You've written {n} so far. A couple more make it richer." (use "Write your first entry this week to get a letter." when n = 0), plus two buttons: "Write an entry" (secondary) and "Write my letter" (primary; disabled with a tooltip if n = 0).
- Hide Patterns until a letter exists. If mood tags exist, you can show the Mood card on its own.

## Mobile (< 768px)

- The letters list becomes a compact horizontal row of week chips (or a dropdown) above the content.
- Order: title → letter → How this week felt → Mood (the 7 days still in one row; shrink the blocks) → meditation card → empty state.

## Accessibility

- Bars: each row exposes its text value ("Hope, 8 out of 10"). Don't rely on bar length alone.
- Mood days: the word is always visible; the colour is supplementary.
- The letter is real text (selectable, copyable), not an image.

## Done when

- The Insights content area and the letters sidebar match the mock-up, in light and dark themes, on desktop and mobile. The main app header and sidebar are unchanged.
- New letters store emotion scores and show the chart; old letters without scores still display fine.
- The empty state works with 0, 1 and several entries.
- No colour tokens were added or changed.
- Typecheck, lint and build pass. List every file you changed, the backend change you made, and any fallback you used.
