# Consciously Journal Insights, update 8

Builds on Insights updates 1–7. **Apply update 7 first** if you haven't yet. This update replaces update 7's simple "From {n} entries" popovers with source links throughout the page.

1. Add `InsightsSources.dc.html` to `docs/design/insights/` in the repo.
2. Open Cursor in Agent mode and paste everything in `CURSOR_PROMPT.md` below the `---` line.
3. Approve Cursor's plan before it edits anything.

Adds: every insight leads back to the entries it came from.
- **Mood:** day by day, with any number of entries per day.
- **Letter:** sourced phrases, with the exact passage quoted.
- **Wins, promises and the recurring thought:** date chips.
- **Emotion scores:** the entries that most support each one.
- **Chart points and What lifts you activities:** the days they came from.

Each one opens a flyout, and the flyout opens the entry with the passage highlighted.

Design reference: `InsightsSources.dc.html` (four panels, A–D, with the flyouts shown open).
