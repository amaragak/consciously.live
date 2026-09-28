# Consciously Journal Insights, update 7

Builds on Insights updates 1–6, which you've already applied. There are no new design files; this uses the existing Insights design references.

1. Open Cursor in Agent mode and paste everything in `CURSOR_PROMPT.md` below the `---` line.
2. Cursor replies with a plan. Approve it before it edits anything.
3. **Before shipping:** check every helpline in `config/support-resources` yourself (numbers, hours, the countries they cover), and set its "last verified" date.

Adds:
1. **Wellbeing safety.** If what someone wrote suggests they're struggling or at risk, the insight switches to a gentle letter with a support banner showing services for their country, and skips scores and "wins". Every Journal and Insights page also gets an always-visible "Need support?" link.
2. **Links to the source entries.** Each pattern opens the entries it came from.
3. **Corrections.** "That's not right" and hide options on patterns, which are remembered in future insights.
4. **Generation states.** Loading, streaming, failure and retry, and a per-user daily limit.
