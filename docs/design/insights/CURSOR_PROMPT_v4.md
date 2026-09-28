# Cursor prompt: Journal Insights, update 4 (flat letter, collapsible sections)

Paste everything below the line into Cursor (Agent mode). Replace `docs/design/insights/Insights.dc.html` with the one in this zip first.

---

## Context

Insights updates 1–3 are built (letter, patterns, opt-in "Generate insights" dialog). This update is **presentation only**. It makes the Insights content area look like the journal entry page, and makes the letter and the patterns collapsible. Don't change generation, the dialog, the data or the API.

Design reference (a design-tool file; treat it as a spec, not code to paste): `docs/design/insights/Insights.dc.html`.

## Scope (unchanged)

Only the Insights content area and the "Your letters" sidebar. Don't touch the main app header, the main app sidebar, the journal pages, other pages, or the colour tokens.

## Step 0: plan first

Reply with a short plan: which components change, which surface token you'll use for the content area (it must be the same one the journal entry editor uses), and where you'll store the collapsed state. **Wait for my OK.**

## 1. Content area matches the journal entry page

- The Insights content area uses the **same surface as the journal entry editor**: the same background token, in both light and dark mode. It sits flush against the "Your letters" pane, divided by the same hairline border as the journal's list pane and editor.
- **Left-align** the content column (about 760px max) with the same horizontal padding as the journal editor (about 64px). Don't centre it in the leftover space; that caused the big gap next to the sidebar.
- **The letter has no card**: no background, no border, no rounded corners, no inner padding. It's text on the editor surface, with a reading width of about 680px. Keep the serif (Fraunces) body, the italic greeting and the sign-off.
- The page header (label, title, "Written from…" line) stays. The "⋯" options button becomes a 36px square with an 8px radius, matching the editor toolbar buttons (use the editor's own button component if there is one).
- **Corners:** pattern cards, the recurring-thought card, the "Turn this week into a meditation" card and the empty state use a **12px radius** (down from 20px). Use the existing radius token closest to 12px if there is one. Pills and round buttons stay round.

## 2. Collapsible sections

There are two sections, **"Your letter"** and **"Patterns this week"**, each with a header row:

- The header row is **one real `<button>`** covering the whole row, with `aria-expanded` and `aria-controls` pointing at the section body. From left to right:
  - a 28px chevron box (8px-radius hairline border; the chevron points down when open and right when closed);
  - the section title in Fraunces at about 22px;
  - on the right, muted meta text at 13px.
- A hairline border sits under the header. There's no card around the section.
- **Meta text:**
  - Letter, open: "{n} min read · Collapse". Work out n from the word count at 200 words a minute, and round up.
  - Letter, closed: "{n} min read · Expand".
  - Patterns, open: "From your mood tags and what you wrote · Collapse".
  - Patterns, closed: a one-line summary built from data you already have, e.g. "Hope 8/10 · Anxious → Calm · 3 wins", then " · Expand".
- **The collapsed letter** still shows its **first sentence** (after "Dear {name},") as a single muted line under the header, truncated with an ellipsis. Clicking it expands the letter too.
- **Animation:** open and close with a short height and opacity transition (about 200ms). Skip it when reduced motion is on.
- Keyboard: Enter and Space toggle. Focus stays on the header after toggling.

**Remembered state:**
- Remember each section's open/closed state **per user**, not per week. Default is both open.
- If there's already a user preferences store (for example the new settings record), keep it there as UI state (`insights.letterCollapsed`, `insights.patternsCollapsed`). Otherwise use localStorage keyed by user ID, wrapped in try/catch.
- If a part hasn't been generated for that week, keep its section header but show the existing "Add a letter →" / "Add patterns →" link as its body. Don't collapse it.

## 3. Keep as is

- All pattern cards, their order and their copy.
- The always-on cards (Mood, What lifts you, Your month so far).
- The "Generate insights" dialog, the empty state behaviour, the "Your letters" list content.

## Done when

- Side by side, the Insights content area and the journal entry editor use the same surface and padding, with no gap or card around the letter. Check this in light and dark mode.
- Both sections collapse and expand with mouse and keyboard, show the right meta text, and remember their state after a reload.
- Screen readers announce each section as expanded or collapsed.
- No colour tokens were added or changed.
- Typecheck, lint and build pass. List the files changed.
