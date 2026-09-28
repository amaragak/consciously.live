# Consciously Journal Insights, update 3

Builds on Insights updates 1 and 2, which you've already applied.

1. Replace the files in `docs/design/insights/` in the repo with the two in this zip.
2. Open Cursor in Agent mode and paste everything in `CURSOR_PROMPT.md` below the `---` line.
3. Cursor replies with a plan (request shape, storage, regenerate behaviour). Approve it before it edits anything.

Adds: opt-in generation through a "Generate insights" dialog. The user chooses the letter and/or patterns (and which patterns), with a "Remember my choices" option. It's still one model call, and it always extracts scores and activities so the always-on cards keep working.

Design references:
- `InsightsGenerate.dc.html`: the dialog (interactive in the design tool)
- `Insights.dc.html`: the page, with the updated empty state
