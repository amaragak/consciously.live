# Consciously Settings page

**Pass 1 (now):** the full Settings UI. Settings that already work are wired up; the rest are disabled with `NOT IMPLEMENTED` / `NOT AVAILABLE YET` markers, which only admins and development builds see. Real users only see what works.

1. Copy `docs/design/settings/` into the root of the repo.
2. Open Cursor in Agent mode and paste everything in `CURSOR_PROMPT.md` below the `---` line.
3. Cursor first classifies every setting (wired / not implemented / not available), then plans. Approve it before it edits anything.
4. It creates `docs/settings-status.md`, the checklist of what's left.

**Then:** run the prompts in `FOLLOW_UP_BATCHES.md` one at a time (AI & data → Privacy → Email → Notifications → the rest). Each batch wires its settings server-side and removes their markers.

Design reference (a design-tool file; treat it as a spec, not code to paste):
- `Settings.dc.html`: desktop (1440px), showing AI & data and Privacy in full.

Before shipping, confirm the AI provider list, and whether "Your content is never used to train AI models" is true for every provider (it's behind a flag, off by default).
