# Consciously Journal Insights redesign

1. Copy `docs/design/insights/` into the root of the repo.
2. Open Cursor in Agent mode and paste everything in `CURSOR_PROMPT.md` below the `---` line.
3. Cursor investigates first and replies with a plan, including the one backend change (emotion scores added to the existing letter call). Approve it before it edits anything.

Design reference (a design-tool file; treat it as a spec, not code to paste):
- `Insights.dc.html`: the Insights page, desktop (1440px). Only the letters sidebar and the content area are in scope; its header bar is there for context. Its content is example data.

The prompt tells Cursor not to touch the main app header or sidebar, or the colour tokens.
