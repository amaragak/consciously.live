# Manifest › Story: plain surfaces, header card, guidelines restyle

This updates the Story feature you've already built. Change only what's listed here. Keep functionality, data and behaviour as they are.

## Reference

`docs/design/app/ManifestoStory.dc.html` and `ManifestoStory.png` are the updated design, top to bottom:

- A: writing (mobile writing on the right)
- D: Raise the ceiling
- C: guidelines (mobile guidelines on the right)
- B: the third-person version with Narrate

Port the structure and px from the HTML source. Ignore the board captions and sample text.

Use the existing tokens by role, with no new colours: card surface, card border, heading, body, muted and label text, accent, primary and outline buttons.

## 1. No paper surface on Story

The ivory paper surface, grain and inset frames belong only to the Manifesto print, because that's the exportable view. Remove them everywhere on Story: states A, B, C and D, the "How to write it" sheet, and mobile.

Wherever Story used paper, use the standard card instead:
- card surface and a 1px card border;
- radius **16px**;
- the app's light card shadow.

Remove every inset frame element.

Padding for the card that replaces the paper:
- A and D, writing card: **40px 56px 56px**.
- B, third-person version card: **40px 56px 44px**.
- Mobile writing card: **20px 18px**.

Everything inside these cards stays as built: header row, fixed line, editor, highlights, popover and section breaks.

## 2. Nothing on the pattern background

Every piece of Story content sits on a card. The page keeps the app's existing content area and page padding, as on the other Manifest pages, so nothing touches the sidebar edge. Cards are separated by a **16px** gap; A and D keep their existing **20px** gap between the writing card and the side column.

### Page header card (A, C, D)

- **Card padding:**
  - C: **22px 32px**.
  - A and D, where the toolbar is inside the card: **22px 32px 18px**, a column with an **18px** gap.
- **Top row:** the title block on the left ("Your story" in serif 30px, and the subline in 15px body colour, with a 6px gap). The listening meter sits on the right, pushed right with `margin-left: auto`, at `flex: 0 1 420px; min-width: 260px`. The row has a **32px** gap and its items align to the bottom.
- **Below `md`:** the meter stacks under the title block at full width, so it never clips. "Goal 10 min" stays visible.

### Toolbar (A and D)

- Remove the helper text "Finds where you played it safe."
- Remove the helper text "Write in the first person if it's easier."
- The buttons don't wrap their labels (`white-space: nowrap`).
- Everything else in the toolbar stays as built.

### B top row

The "Keep writing" back link and its explanation line go in a card, padding **14px 24px**, keeping the existing contents and the **14px** gap.

## 3. Guidelines (C, and the "How to write it" sheet)

Restyle the guidelines as a regular left-aligned card. **Nothing is centred.**

- **Card:** padding **28px 32px 30px**, a column with a **22px** gap.
- **Intro block** (a column, **8px** gap):
  - "Before you start" in 11px caps, letter-spacing 1.4px, 600, label colour. Use no rules beside it.
  - "How to write your story" in the app's serif, regular weight (not italic, not the display face), **26px**, line-height 1.2, heading colour.
  - The intro sentence, unchanged, in 15px, line-height 1.55, body colour, `max-width: 640px`. It's plain, not italic.
- **Divider:** a single 1px rule in the card-border colour, replacing the double rule.
- **Principles:**
  - **Layout:** a grid of two columns from `md` up and one column below `md`. Column gap **48px**, row gap **24px**.
  - **Each item:** a row with a **14px** gap.
    - The numeral in italic serif **22px**, accent, **30px** wide.
    - Then a column with a 4px gap: the title in serif **18px**, line-height 1.3, heading colour, and the body in 14px, line-height 1.55, body colour.
  - The text of all six items stays as it is.
- **Divider:** the same single rule.
- **Actions row:** left-aligned, **12px** gap, wrapping.
  - "Start writing" (primary, **44px**).
  - "Talk it out" (outline, **44px**).
  - The hint "You can reopen this any time from "How to write it"." in 12px muted, with an extra 8px on its left.
  - In the sheet version, "Back to writing" replaces the two buttons, as now.

## 4. Mobile (below `md`)

### Writing

The separate meter card and the title row merge into one header card:
- padding **14px 16px**, a column with a **12px** gap;
- first the row with "Your story" (serif 24px) and the "Prompts" link on the right;
- then the compact meter.

The writing card follows (section 1). Go bigger, Talk it out and Make it my story stay as built.

### Guidelines

- **Header card:** padding **18px**, a **14px** gap. "Your story" in serif 24px with the 13px subline, then the compact meter.
- **Guidelines card:** padding **20px 18px 22px**, a **16px** gap.
  - The intro block as on desktop, with the title at **22px** and the intro at 14px.
  - One rule.
  - The six items in one column with a **16px** gap: numeral **20px**, title **17px**, body **13px**.
- The pinned "Start writing" button at the bottom stays as built.

## Don't change

- The Manifesto print and its paper treatment.
- The Edit and Manifesto tabs.
- Prompts, Go bigger, Raise the ceiling, Make it my story, Narrate, versions or any data.
