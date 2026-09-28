# Cursor prompt: Journal Insights, update 8 (links back to entries)

Paste everything below the line into Cursor (Agent mode). Add `docs/design/insights/InsightsSources.dc.html` to the repo first.

---

## Context

Insights updates 1–7 are built. Update 7 added basic "From {n} entries" popovers. This update **replaces them** with source links across the page, so every insight leads back to the entries it came from. Build on what's there.

Design reference (a design-tool file; treat it as a spec, not code to paste): `docs/design/insights/InsightsSources.dc.html`. It has four panels:
- A: Mood by day;
- B: the letter's sourced phrases;
- C: wins, promises and the recurring thought;
- D: emotion scores and chart points.

**Important: never assume one entry per day.** A day can have zero, one or many entries, each with its own mood (or none). Check every place in the Insights code that currently keys anything by date, and fix it.

## Scope

- **In scope:**
  - the Insights content area;
  - the generation response and prompt (for source references);
  - a small change to the journal entry page, to highlight a passage when opened from Insights.
- **Out of scope:** the main app header and sidebar, other pages, and the colour tokens. Don't change the update 7 safety behaviour: in `at_risk` insights, the hidden cards stay hidden.

## Step 0: plan first

Reply with a plan covering:
- the source-reference shape in the generation response;
- how quotes are verified;
- the flyout component (one shared component);
- how the journal page highlights a passage;
- every place the Insights code currently assumes one entry per day.

**Wait for my OK.**

## Data: source references

- The generation response references sources as `{ entryId, quote? }`. `quote` is a **verbatim** passage from the entry, short (up to about 25 words). Sources are attached to:
  - **letter phrases:** the letter returns its paragraphs with inline source spans, e.g. `{ text, sources: [{ entryId, quote }] }` per span. Pick the format and show me in the plan. Only phrases that paraphrase or quote a specific entry get sources; general sentences get none.
  - **each win and promise** (1 or more);
  - **the recurring thought** (every occurrence);
  - **each emotion score** (up to 3 entries that most support it, each with a quote).
- The data you already have covers the rest; no model output needed:
  - Mood uses entries and their mood tags;
  - How it moved uses the days with entries;
  - What lifts you uses the entry IDs per activity.
- **Verify on the server before saving:**
  - drop any `entryId` that isn't the user's or isn't in the period;
  - check each `quote` against the entry's text, using whitespace- and case-insensitive matching, with a tolerance for curly vs straight quotes and small punctuation differences.
  - If the quote doesn't match, keep the link to the entry but drop the quote. If the entry is invalid, drop the source.
  - **Never show a quote that isn't in the entry.**
- **If an entry is deleted or edited later:** a deleted entry's source links disappear. An edited entry whose quote no longer matches shows the entry without the highlight.

## The flyout (one shared component)

- **Opens:**
  - on **hover** after about 150ms, on devices with a pointer (`(hover: hover)`);
  - on **click, tap, or Enter/Space** on every device.
  
  It stays open while the pointer moves into it. It closes on pointer leave (after about 200ms), Esc, or a click outside.
- **Accessibility:**
  - The trigger is a real button or link with `aria-haspopup="dialog"` and `aria-expanded`.
  - The flyout is a non-modal popover. Focus moves into it when opened by keyboard, and back to the trigger on close.
- **Position:** placed next to its trigger and flipped to stay on screen; about 340px wide; 12px radius; a soft shadow; existing tokens.
- **Contents:**
  - An optional header, e.g. "Wed 24 Sept · 2 entries", "From 3 entries", or "Most behind 'Self-doubt'".
  - A list of entries, each a link showing:
    - time (and date when it's not obvious);
    - title;
    - mood chip, if tagged;
    - and either the first line (2 lines max) or the **quote with its matched passage highlighted**, with a few words of context either side and ellipses.
  - Hovering or focusing an item gives it a light background.
  - Optional footer link: "Open {day} in Journal →" for day flyouts.
- **Opening an entry** goes to the journal entry page with the passage **highlighted and scrolled into view**, e.g. `?highlight=<encoded quote>`. The highlight fades after a few seconds. Journal page change: this highlight only; nothing else on that page changes.
- On small screens, the flyout becomes a bottom sheet.

## Touch points

**A. Mood, day by day** (the day strip and the long-period calendar from update 6):
- Each day cell is split into **one slice per entry**, in that entry's mood colour, in time order. Days with more than one entry show a small count badge.
- A day with entries but no mood tags shows a neutral cell with a dot.
- A day with no entries is the dashed empty cell, and isn't interactive.
- **Behaviour:**
  - one entry: clicking opens it directly, and hovering shows the flyout with that entry;
  - several entries: the flyout lists all of them, with the "Open {day} in Journal →" footer.
- Accessible names spell it out, e.g. "Wednesday, 2 entries: Low, Mixed".
- The day summary sentence must also consider every entry, not just the first per day.

**B. The letter:**
- Sourced phrases get a quiet dotted underline, using an accent colour at low emphasis, and a light background on hover. They open the flyout with the quoted passage(s).
- Don't over-link: at most one sourced span per sentence, and no underline on a whole paragraph.
- The letter must still read cleanly with sources off (e.g. when printed or copied).

**C. Wins, promises, the recurring thought:**
- Each item gets a small **date chip** on the right, like "Fri 26", or "{n} entries" when there are several. The chip is the trigger.
- The recurring thought's chip ("3 times") lists every occurrence.

**D. Scores and charts:**
- **Emotion bars:** the whole row is the trigger, and the flyout lists the up to 3 supporting entries with quotes.
- **How it moved:** each point is a day, and opens the same day flyout as Mood. Give the points a bigger hit area than the dot.
- **What lifts you:** each activity pill opens the days and entries it appeared on.
- **Over time:** each bar opens that insight, not entries.

## Replace update 7's popovers

Remove the "From {n} entries" links and their popover from update 7. Everything goes through the shared flyout and the triggers above. Keep update 7's corrections menu ("⋯") on each item, next to the date chip.

## Done when

- Every touch point listed above opens the right entries. Days with 0, 1 and 3 entries behave correctly.
- Quotes shown always exist in the entry. Add tests:
  - matching tolerance;
  - an invented quote is dropped;
  - a foreign entry ID is dropped;
  - a deleted entry.
- Opening from a flyout lands on the entry with the passage highlighted.
- Hover works with a mouse, and click, tap and keyboard work everywhere. The flyout becomes a bottom sheet on mobile.
- No assumption of one entry per day remains in the Insights code (list the places you fixed).
- No colour tokens were changed.
- Typecheck, lint, tests and build pass. List the files changed and the updated response schema.
