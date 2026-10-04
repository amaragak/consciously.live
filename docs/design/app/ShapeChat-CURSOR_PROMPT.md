# Create flow: Shape step update (brief card and chat column)

## Goal

This is an update to the **Shape step** of the Create flow you've already built. It changes three things:
1. **A brief card.** What the user typed on Start is pinned at the top in a card, together with the context chips. **It is no longer sent into the thread as the first user bubble.**
2. **A reading column.** The brief card, thread, input and links sit in one column with a **max-width of 760px**, **left-aligned** (not centred).
3. **A top-aligned thread.** Messages start directly under the brief card instead of being pushed to the bottom.

Everything else on the step stays as it is: the chat behaviour, the style questions, quick replies, Show as form, Reset, the program card, the footer, and the stepper in the header.

**References:**
- `docs/design/app/ShapeChat.dc.html` and `ShapeChat.png`: desktop on the left, mobile at 360px on the right.
- Read the source of the Shape column and port its structure: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Ignore the `<helmet>`, `<x-dc>` and script wrappers, the board text, the header, the sidebar and the background. The dot pattern is a stand-in for the existing background; keep that as it is.

## Colours

Don't take colours from the design file. Use the existing tokens for each role:
- the card surface and border;
- heading, body and muted text, and label text;
- the outline button style for the edit button;
- everything the current context bar, bubbles and input already use.

## Don't touch

The header (including the stepper), the sidebar, the footer, the Start and Sound steps, colour tokens, and the chat and generation logic, apart from what's listed below.

## Changes

### 1. Brief card (replaces the context bar)
**Desktop:**
- **Card:** card surface, 1px border, radius **14px**, padding **12px 16px**, a column with a **10px** gap, and a soft shadow (as in the design). It doesn't shrink.
- **Row 1** (items centred, **10px** gap):
  - **Brief:** the flow's `prompt` in serif **18px**, line-height 1.35, flex 1, `min-width: 0`, on one line with an ellipsis. The full text is in its `title`.
  - **Edit button:** a **32px** circle in the outline style, with a **14px** pencil icon and `aria-label="Edit brief"`.
- **Row 2:** the existing context bar contents, unchanged: the tokens, "+ Add", and the right-aligned "{Style} questions" progress.

**Empty prompt** (e.g. the user went to Shape without typing):
- Row 1 shows "Add a line about what this is for" in serif 18px, muted, italic.
- Clicking it starts editing.

**Editing:**
- ✎ (or the empty placeholder) turns the brief into an auto-growing textarea in the same type style.
- Enter, or clicking away, saves. Shift+Enter adds a new line. Esc cancels.
- Saving updates the flow's `prompt`. The next chat request carries it. Don't reset the chat or the answers.

**Program attached:**
- The brief card sits above the program card.
- Row 2 shows only the tokens that aren't the program (if there are none, there's no row 2).

**Mobile (below `md`):**
- padding **10px 12px**;
- the brief in serif **16px**, **clamped to 2 lines**;
- row 2 shows only the tokens, on one line that scrolls sideways (no "+ Add", no progress bars, as before).

### 2. The first message is no longer a bubble
- **Thread:** the Start text is no longer added to the thread as a user bubble. The thread begins with the assistant's first turn.
- **Requests:** the `prompt` is still sent with every chat request, as context, exactly as before. Only the rendering changes.
- **Existing threads** that already have it as their first message should skip that message when rendering, but keep it in the data.

### 3. Chat column
**Desktop:**
- **The column:** the brief card, the thread, the input and the "Show as form / Reset" row together form one column, with a **max-width of 760px**, **left-aligned**, with padding **24px 0 16px** and an **18px** gap.
- **Input:** pinned at the bottom of the column, above the footer.
- **The links row:** stays under the input, with an 8px gap above it.

**Thread:**
- flex 1, a column with a **12px** gap, **aligned to the top**, and scrolls;
- it auto-scrolls to the newest message when one arrives, unless the user has scrolled up;
- the bubble max-widths stay at 86% (assistant) and 80% (user), now relative to the column.

**Mobile (below `md`):** no change to widths. Apply the brief card and the top-aligned thread only.

## Done when

- Desktop and 360px match `ShapeChat.png`.
- **Brief:** the brief shows in the card, the edit saves, the edited brief reaches the next chat request, and there's no duplicate user bubble.
- **Chat column:** the column never exceeds 760px, stays left-aligned at every width, and starts the thread at the top.
- **Unchanged:** the style questions, quick replies, Show as form, Reset, the program card and the footer all still work.
- List the files changed.
