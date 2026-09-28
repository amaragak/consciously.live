# Cursor prompt: Journal Insights, update 3 (choose what to generate)

Paste everything below the line into Cursor (Agent mode). Replace the files in `docs/design/insights/` with the two in this zip first.

---

## Context

Insights updates 1 and 2 are built (letter, emotion bars, mood week, arc, wins/promises, recurring thought, what lifts you, month view). This update makes generation **opt-in and selectable**: nothing is generated until the user asks, and they choose whether they want the letter, the patterns, or both. Build on what's there.

Design references (design-tool files; treat them as specs, not code to paste):
- `docs/design/insights/InsightsGenerate.dc.html`: the "Generate insights" dialog (it's interactive in the design tool; the logic in its script block shows the behaviour).
- `docs/design/insights/Insights.dc.html`: the page, including the updated empty state with the "Generate insights…" button.

## Scope (unchanged)

Only the Insights content area, the "Your letters" sidebar and the generation backend. Don't touch the main app header, the main app sidebar, other pages, or the colour tokens. No Manifest or Today integration.

## Step 0: plan first

Reply with a short plan: the new request shape for generation, how each option maps onto the prompt and the stored data, where "remember my choices" is stored, and how regenerating a single part works. **Wait for my OK.**

## The dialog: "Generate this week's insights"

**Opens from:**
- The empty-state primary button, which is now **"Generate insights…"** (replacing "Write my letter"). Its heading changes to "Your insights are written from this week's entries."
- The "⋯" menu on a week that already has insights: "Generate again…".
- Small "Add a letter →" / "Add patterns →" links shown in place of whichever part hasn't been generated for that week (these open the dialog with that option pre-ticked).

**Contents (copy exact):**
- Title "Generate this week's insights"; subline "From your {n} entries and {m} meditations since {weekday}." (drop the meditations part if it can't be counted).
- **Option 1**, checkbox card: "A letter to you" / "A personal note written from your week: what came up, what shifted, what to carry forward."
- **Option 2**, checkbox card: "Patterns" / "Charts and highlights: how the week felt and moved, your wins, promises and recurring thoughts."
  - An expander, "Choose which patterns ▾" / "Hide pattern options ▴" (collapsed by default), revealing sub-checkboxes: **How this week felt** (· emotion scores), **How the week moved**, **Wins and promises**, **The thought that keeps coming back**.
  - A muted line: "Always on, from your data: Mood week, What lifts you, Your month so far."
  - Unticking "Patterns" disables the sub-checkboxes (greys them out and keeps their values). Unticking every sub-checkbox counts as "Patterns" being off.
- "Remember my choices for next week" checkbox.
- Footer: **Cancel** (secondary) and a primary button whose label follows the selection: "Generate letter + patterns" / "Generate letter" / "Generate patterns". With nothing selected it's disabled and reads "Choose at least one".
- **Defaults:** the saved choices if "remember" was on; otherwise everything ticked.
- If the week has fewer than 2 entries, show a gentle inline note above the footer ("Insights are richer with a few more entries. You can still generate now.") without blocking.

**Behaviour:**
- It's a modal dialog: focus moves in, Tab is trapped, Esc and Cancel close it, and focus returns to the button that opened it. `role="dialog"`, `aria-modal`, labelled by its title.
- Mobile (< 768px): becomes a bottom sheet with the same content.
- On submit: close the dialog and show loading placeholders in the page for exactly the parts being generated ("Writing your letter…", skeleton cards for the chosen patterns). Other parts stay as they are.

## Backend

- The generation endpoint takes the selection, e.g. `{ "letter": true, "patterns": { "felt": true, "moved": true, "wins": true, "thought": false } }`.
- **Still one model call.** Build the prompt and the response schema from the selection: only ask for the letter text if `letter` is true, and only for the pattern fields that were ticked.
- **Always extract the cheap data** (`emotions` scores and per-entry `activities`) whenever *any* generation runs, even if "How this week felt" isn't ticked. The always-on cards (What lifts you, Your month so far) depend on them. Store them, but only *show* "How this week felt" if it was ticked.
- **Promises:** only generated when "Wins and promises" is ticked. A later letter checks in on the most recent stored promises, whichever week they came from, as long as they're within the last 2 weeks.
- **Regenerating** replaces only the parts selected this time and keeps the others. Keep the previous letter text if the new call fails.
- **Store the selection** with the week's insights, so the page knows which cards were generated versus not requested (not requested → show the "Add … →" link, not an empty card).
- **"Remember my choices"** is stored per user (server-side preference if there's a settings table; otherwise tell me and use client storage).

## Page states

- **Nothing generated:** the empty state with "Generate insights…". Always-on cards (Mood week and, once unlocked, What lifts you and Your month so far) may still show below it if there's data.
- **Letter only:** the letter card, then "Add patterns →" where the patterns would start, then the always-on cards.
- **Patterns only:** a slim "Add a letter →" card where the letter would be, then the chosen pattern cards and the always-on cards.
- **Both:** as now.
- "Turn this week into a meditation" shows whenever a letter **or** patterns exist (build its pre-fill from whichever is there).

## Done when

- Nothing is generated automatically; everything comes from the dialog.
- Each combination (letter only, patterns only, any subset of patterns, both) produces exactly those parts, with one model call.
- Regenerating one part leaves the others intact.
- "Remember my choices" persists and pre-fills the next time.
- The dialog is keyboard-accessible and becomes a bottom sheet on mobile.
- Header, main sidebar and colour tokens are untouched. Typecheck, lint and build pass. List files changed, the request/response schema, and where the preference is stored.
