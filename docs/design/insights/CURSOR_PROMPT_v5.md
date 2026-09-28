# Cursor prompt: Journal Insights, update 5 ("What lifts you" with little data)

Paste everything below the line into Cursor (Agent mode). Replace `docs/design/insights/Insights.dc.html` with the one in this zip first.

---

## Context

Insights updates 1–4 are built. This update changes **only the "What lifts you" card**. Its current version waits for 3 weeks of entries and shows nothing until then. People journal inconsistently, so the card should show something from the first mood-tagged entry, and only make stronger claims as data builds up.

Design reference: the "What lifts you" card in `docs/design/insights/Insights.dc.html` (a design-tool file; treat it as a spec, not code to paste).

## Scope

- **Change only:** the "What lifts you" card and the server-side function that builds its data.
- **Don't change:** any other card, the letter, the collapsible sections, the generation call or its prompt, the dialog, the header, the sidebars, or the colour tokens.
- **Use existing data only:**
  - the activities already extracted per entry;
  - the mood tag already captured per entry.
- No new model calls. It's counting on the server.

## Step 0: plan first

Reply with a short plan: where the card's data is built today, how you'll compute the counts, and how you'll decide which stage applies. **Wait for my OK.**

## Data

- **Window:** the last 4 weeks. If there are fewer than 6 mood-tagged days in that window, extend it back week by week, up to 12 weeks, until there are at least 6 or you run out. Show the actual window in the card's corner ("Last 4 weeks", "Last 9 weeks").
- **Grouping:**
  - Days tagged Good or Calm are **good days**.
  - Days tagged Low are **low days**.
  - Mixed days are ignored.
  - If a day has several entries, merge that day's activities (count each activity once per day).
- **Normalise activity names** so that "walk", "morning walk" and "went for a walk" count as one activity. Reuse whatever normalisation the extraction already does. If there isn't any, lowercase the names and trim them, and don't build anything fancier here.
- **For each activity, count** the good days and low days it appears on.

## What the card shows: three stages, chosen by data

**Stage 1: describe (at least 1 good or low day, but less than stage 2).**
- Section labels: "On your good day" / "On your 2 good days", and the same for low days.
- List up to 3 activities from those days (the most frequent first), with no counts.
- No claims about cause or pattern.

**Stage 2: compare with counts (at least 3 good days and at least 1 low day).**
- Section labels: "On your {n} good or calm days" / "On your {n} low days".
- Each activity is a pill with its count on the right, e.g. "Morning walks · 3 of 4".
- Show up to 3 per side. Only include an activity if it appears on at least 2 days on that side.
- On the good side, sort by count. Prefer activities that appear more often on good days than on low days.

**Stage 3: pattern language (at least 10 mood-tagged days, with at least 3 good and at least 2 low).**
- Same layout as stage 2.
- The good-side label becomes **"Tends to show up on your good days"**, and the low-side label **"Tends to show up on your low days"**.
- Only list an activity here if it appears on at least 3 days and its share of good days is clearly higher than its share of low days (or the other way round for the low side).
- If nothing qualifies, fall back to stage 2.

**Footer (a muted line at 12px):**
- Stages 1 and 2: "Early days: this gets clearer the more days you tag a mood."
- Stage 3: no footer.
- Never mention a count of entries needed, a progress bar, or "unlocks".

**Empty (no good or low days in 12 weeks):**
- Keep the card, with one line: "Tag a mood on your entries and we'll show what tends to come before your good days."
- Link "Write an entry" to the journal.
- A side with nothing to show is simply omitted.

**Copy rules:**
- Never say an activity *causes* or *makes* a mood.
- The card title stays "What lifts you".
- Remove "Unlocks after 3 weeks of entries." everywhere.

## Done when

- The card shows the right stage for these cases (add tests with fixture data):
  - 0 good or low days;
  - 1 good day;
  - 3 good days and 1 low day;
  - 12 days with clear patterns;
  - 12 days with no activity passing the stage 3 threshold (falls back to stage 2).
- The window extends back when data is sparse, and the corner label shows the real window.
- No other card, prompt or token changed.
- Typecheck, lint and tests pass. List the files changed.
