# Create flow: how an attached program renders on the Shape step

## Goal

This changes **only how an attached program is rendered** on the Shape step. Today the program appears three times (a Context token, the Program card, and a large "Program added" card in the thread), and in the narrower layout its expanded card pushes the thread out of view.

After this change:
1. The program appears **once**: in the rail on wide screens, or as a collapsible row in the panel header on narrower screens. In the thread it's a small inline marker.
2. Long session lists scroll **inside** the program UI, never pushing the chat.

**Reference:** `docs/design/app/ShapeProgram.dc.html` and `ShapeProgram.png`. The three frames are: wide (rail), narrow collapsed, and narrow expanded.
- Read the source of the program pieces and port their structure: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Ignore the wrappers, the board text, the header, the sidebar and the background.
- Only the program elements are in scope. **Everything else in the frames is context**: the brief, the journal row, the bubbles, Reset, the input and the footer. Leave those as they are now.

## Colours

Don't take colours from the design file. Use the existing tokens for each role:
- card surface and border;
- the page background tint (the program box in the narrow header);
- the accent and accent tint (checked boxes, the marker chip);
- label, heading, body and muted text;
- the outline button style (Edit / Done).

## Don't touch

- Widths and layout breakpoints.
- The brief, the Context items other than the program, and the Questions card.
- Chat behaviour, the bubbles and markdown.
- The footer (including "Create {n} now"), the header, the sidebar, and the Start and Sound steps.

## Changes

### 1. Remove the duplicates
- **Context:** don't list the program as a token in the Context card (wide) or in the chip row (narrow). Other context items stay as they are.
- **Thread:** replace the large "Program added" card with the **same inline marker style the journal uses**.
  - It's right-aligned, with "PROGRAM ADDED" (the existing marker label style) and a small chip.
  - The chip is **28px** high, padding **0 10px 0 3px**, radius **8px**, accent-tint background and border, sans **12px 600**, `nowrap`, with a **22×22** cover (radius 6px) and the program title.

### 2. Wide layout: Program card in the rail
The card shell and eyebrow are the same as the other rail cards, with the eyebrow "Program".

1. **Top row** (centred, **12px** gap):
   - the **44×44** cover, radius 8px;
   - a text column (flex 1, `min-width: 0`, 2px gap): the title in serif **16px**, line-height 1.25 (it wraps), then "Making it your own" in sans 12px, muted;
   - **×** (14px, muted, top-aligned, `aria-label="Remove program"`), which detaches the program.
2. **The segmented control:** One meditation / One per session, full width (segments flex 1, padding **6px 8px**, sans **12px**; selected: card surface, 1px border, 600).
3. **A 1px hairline.**
4. **Sessions header** (space-between, baseline):
   - "Sessions · {selected} of {total}" in sans **12px**, muted;
   - on the right, "**All**" (12px 600, label colour) and "**None**" (12px 600, muted), with a 10px gap. They select or clear all sessions. **This replaces "Clear all".**
5. **Checklist:**
   - one column with a **9px** gap;
   - each row has an **18px** checkbox (radius 5px; checked: accent fill with ✓) and "{n}. {title}" in sans **13px**; unchecked rows are muted;
   - **max-height 186px** (about 6 rows), scrolling inside the card.

- **The rail itself** gets `overflow-y: auto`, so if its cards outgrow the height it scrolls on its own. The chat never moves.
- **"One meditation" selected:** the checklist stays visible and selectable, as it works today.

### 3. Narrow layout: collapsible program row in the panel header
It goes under the brief row and above the chip row.

- **The box:** page-background tint, radius **12px**, padding **10px 12px**, a column with a **10px** gap.
- **Collapsed (default) row** (centred, **12px** gap):
  - the **40×40** cover, radius 8px;
  - a text column (flex 1, `min-width: 0`, 1px gap): the title in serif **16px**, one line with an ellipsis; under it, "{selected} of {total} sessions · {One per session | One meditation}" in sans 12px, muted;
  - **"Edit ▾"**: an outline pill, **32px** high, padding 0 12px, sans **13px 600**.
- **Expanded:**
  - "Edit ▾" becomes **"Done ▴"**;
  - below the row, a 1px top border, padding-top **10px**, and a column with a **10px** gap holding the segmented control, the Sessions header (with All · None) and the checklist (no max-height of its own here);
  - **header cap:** while expanded, the whole panel header has a **max-height of 45% of the panel** and scrolls inside, with a soft fade at its bottom edge (as in the design). The thread keeps the rest of the panel and scrolls on its own; it must never slide under the input.
  - **It collapses automatically** when the user sends a message, or presses Done.
- **Removing the program:** that's done from the expanded state. Add "Remove program" (sans 12px 600, muted) under the checklist.

### 4. Mobile (below `md`)
Mobile uses the narrow pattern. Make the following adjustments:
- the title is serif **15px**;
- the expanded header cap is **55%** of the panel.

## Done when

- With a program attached, it appears once in the side UI (the rail card, or the header row) and once in the thread (as the small marker). It's in no Context token or chip.
- **Wide:** the rail card matches the first frame. A program with more than 6 sessions scrolls inside the checklist, and All / None work.
- **Narrow:** it's collapsed by default (the second frame). Edit expands it (the third frame). The header never takes more than 45% of the panel, the thread stays visible and scrollable, and sending a message collapses it.
- Nothing outside the program rendering has changed.
- List the files changed.
