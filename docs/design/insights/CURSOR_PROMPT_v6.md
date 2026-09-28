# Cursor prompt: Journal Insights, update 6 (choose the period)

Paste everything below the line into Cursor (Agent mode). Replace both files in `docs/design/insights/` with the ones in this zip first.

---

## Context

Insights updates 1–5 are built. Right now an insight always covers the last Monday-to-Sunday week, which is too rigid. This update lets the user choose the period when they generate: **Last 7 days**, **Last 30 days** or **Custom**. Build on what's there.

Design references (design-tool files; treat them as specs, not code to paste):
- `docs/design/insights/InsightsGenerate.dc.html`: the dialog with the period picker. Its script block shows the behaviour.
- `docs/design/insights/Insights.dc.html`: the page with range labels.

## Scope

- **Change:** the Generate dialog, how insights are stored and keyed, the generation request, the "Your insights" sidebar, the page header, and the card titles and layouts that assume a week.
- **Don't change:** the main app header or sidebar, other pages, the colour tokens, the letter styling or the collapsible sections (update 4), or the "What lifts you" stage logic (update 5), apart from its window (below).

## Step 0: plan first

Reply with a short plan covering:
- the new storage key and the migration of existing weekly insights;
- the request shape;
- how entry text is budgeted for long periods;
- how each card adapts.

**Wait for my OK.**

## Periods

All dates are in the user's time zone and inclusive.
- **Last 7 days:** today and the 6 days before.
- **Last 30 days:** today and the 29 days before.
- **Custom:** From and To dates.
  - To can't be later than today, and From can't be after To.
  - A custom range is at most **90 days**.
  - Validate all of this on the server too.

## Storage and migration

- Key each insight by `startDate` and `endDate`, plus `periodType` (`last7 | last30 | custom | week`), instead of by week.
- **Migrate existing insights** to `periodType: 'week'` with their Monday–Sunday dates. Nothing is lost, and old links keep working (redirect them if the URL shape changes).
- **Generating the exact same range again replaces that insight**, as "Generate again" does today. A different range, even an overlapping one, creates a new insight.
- The URL identifies the insight (by id, or by start and end dates), so the page can be deep-linked.

## Generation

- The request gains `startDate`, `endDate` and `periodType`. Only entries and meditations in that range are sent.
- Tell the model what period it's writing about, and in what words ("this week", "this month", or "these two weeks, 14–28 Sept"), so the letter doesn't say "this week" about a month. Keep it one model call, with the same options as update 3.
- **Token budget for long periods:** set a maximum amount of entry text per request.
  - If a period goes over it, shorten each entry proportionally (keep its start and end) rather than dropping whole entries.
  - Tell me the budget you chose.
- Always extract the per-entry scores and activities, as before.

## The dialog

Follow the mock-up.
- **Title:** "Generate insights".
- **A "Covering" segmented control**, above the Letter / Patterns options: "Last 7 days · Last 30 days · Custom…". Use buttons with `aria-pressed`. The default is Last 7 days, or the remembered choice.
- **Custom…** reveals **From** and **To** date fields, with the helper "Up to 90 days." Show an inline error for invalid ranges.
- **The summary line under the title updates with the period:** "From your {n} entries and {m} meditations in the last 7 days." / "…in the last 30 days." / "…between {from} and {to}."
  - Get the counts from a light endpoint, e.g. `GET /insights/preview?start=&end=`, which returns counts only.
  - If there are 0 entries, the primary button is disabled with the label "No entries in these dates".
- **"Remember my choices for next time"** also remembers the period preset. A remembered Custom falls back to Last 7 days.
- **Pre-filling:**
  - "Generate again…" pre-fills that insight's range (as Custom, unless it matches a preset for today).
  - "Add a letter →" / "Add patterns →" pre-fill that insight's range and the missing option.
- Copy changes: "written from your week" → "written from these days"; "how the week felt and moved" → "how this time felt and moved".

## The page

**Sidebar:**
- Title: **"Your insights"** (was "Your letters").
- Each item's label is "{Last 7 days | Last 30 days} · {range}", or just the range for custom and migrated weeks, e.g. "Last 7 days · 22–28 Sept", "14–21 Sept". Keep the quoted first line under it.
- Sort by end date, newest first.
- Presets are labelled by what they covered when generated. "Last 7 days" on an old insight is fine because the range sits next to it.

**Header:**
- The label shows the same text as the sidebar item.
- The title comes from the letter; if there's no letter, it's "Your insights for {range}".
- The meta line is "Written from your {n} journal entries and {m} meditations".

**Card titles by period length:**
- 7 days or fewer: "this week" / "the week".
- 28–31 days: "this month".
- Anything else: "these days" / "this time".

This gives "How this week felt" / "How this month felt" / "How these days felt", and "How the week moved" / "How the month moved" / "How it moved". The "Patterns" section header no longer says "this week".

## Cards that need to adapt

- **Mood:**
  - Up to 14 days: the day strip as now, one cell per day, wrapping to a second row after 7.
  - Longer periods: a compact calendar grid, with one row per week, Monday to Sunday columns, and date numbers in each cell. Days outside the period are blank.
  - Keep the summary sentence.
- **How it moved:** the x-axis spans the period. Up to 14 days, label every day; longer, label each week's start date. The curve uses days with entries only.
- **"Your month so far" becomes "Over time":**
  - It shows the emotion scores from the **last 4 insights you generated** (this one included), with each bar labelled by its range.
  - Hide it if there are fewer than 2 insights.
- **What lifts you:** use the **longer** of the selected period and the update 5 window. Everything else from update 5 stays.
- **Promises:** the helper becomes "The next insights you generate will ask how these went." When generating, include open promises from the most recent insight that ended before this one started.

## Done when

- The user can generate for Last 7 days, Last 30 days and a valid custom range. Invalid ranges and empty ranges are blocked in the UI and on the server.
- Existing weekly insights still show, labelled by their dates.
- Regenerating the same range replaces it; a different range adds a new insight.
- The letter talks about the right period, and card titles and layouts adapt at 7, 30 and 90 days.
- Add tests: date maths at month ends and across a daylight-saving change, range validation, migration, the replace-vs-new rule, and the token budget trimming.
- No colour tokens were changed.
- Typecheck, lint, tests and build pass. List the files changed and the new schema.
