# Focus marketing page: mobile layout

## Goal

Make the Focus marketing page work on phones, **below the existing mobile breakpoint (`md`)**. Match `docs/design/marketing/FocusMobile.dc.html` and `FocusMobile-360.png` exactly. Desktop (`md` and up) stays unchanged.

- Use the **same sections, in the same order, with the same copy as the current desktop page**, including each section's sub-points. If the desktop copy differs from the design file, keep the desktop copy.
- Save height by restyling the graphics into the compact stacked versions in the design, not by dropping content.

## How to use the design file

`FocusMobile.dc.html` is plain HTML with inline styles. **Read its source and port its structure**: the same elements, nesting, borders, radii, padding, gaps, alignment and font sizes.
- Ignore its `<helmet>`, `<x-dc>` and script wrappers.
- Treat the source as the source of truth for layout.

**Don't add anything the design doesn't have.** That means no extra containers, cards, borders, backgrounds, radii, shadows or padding around groups of elements. Likewise, don't drop anything it does have (hairlines, labels, rings, checkboxes, chips, level bars, the "Coming soon" pill).

## Colours

- **Section backgrounds:** don't take them from the design file. Use the desktop page's own section backgrounds, in the same alternation.
- **Everything else** (cards, hairlines, accent, buttons, rings, chips, bars, text): match the design. Use the desktop token wherever one already plays that role.

## Don't touch

Desktop (`md` and up), the footer, colour tokens, other pages. The mobile menu is handled separately.

## Global (below `md`)

- Side padding is **20px** in every section. No horizontal scroll at 320px.
- Sections are separated by a 1px hairline (top border).
- Section padding is **40px** top and bottom. The hero is the exception (40px top, 44px bottom), and so is the closing CTA (44px).
- **Section structure:** a single **left-aligned** column with a **12px gap**, containing, in order:
  1. **eyebrow:** sans **11px**, uppercase, letter-spacing **1.6px**, weight 600, accent;
  2. **H2:** serif 400, **30px**, line-height 1.1;
  3. **lead:** sans **15px**, line-height 1.55, body colour, with 4px extra below it;
  4. **sub-points:** a column with a **10px** gap, 4px bottom padding. Each point is a column with a 2px gap: its title in serif **17px**, heading colour, then its text in sans **14px**, line-height 1.5, muted;
  5. the graphic.
- **Cards:** radius **14px**, 1px hairline border, card surface, padding **14px 16px**, a column with a **10px gap**, auto height. Use one card per section; sub-parts are divided by a 1px hairline inside the card.
- **Small labels inside cards:** sans **10px**, uppercase, letter-spacing **1.4px**, accent.
- **Chips:** padding **7px 13px**, pill radius, sans **13px**, `nowrap`. Selected chips use the desktop selected style; the others are outline-only.
- **Checkbox rows:** a flex row with a 10px gap, items centred, padding **7–8px 0**, a 1px hairline on top, sans **14px**, and a **14px** outline checkbox with a 4px radius.
- **Progress rings:** a 4px stroke, an accent arc on a muted track, with the time in serif in the centre.

## Sections

### 1. Header
- **Height 60px.** Padding 0 12px 0 20px, with a 1px hairline at the bottom.
- The sun at 22px, then "consciously" in serif 22px, then the verb "*Focus*" in serif italic 22px, accent.
- On the right, a **44×44** menu button.

### 2. Hero (centred)
- **The hero stays centred, as on desktop:** `text-align: center`, with items centred.
- A column with a **16px gap**:
  - **H1:** serif 400, **40px**, line-height 1.06, letter-spacing −0.6px.
  - **Strapline:** sans **16px**, line-height 1.5, body colour, centred.
  - **Button** "Start a focus session": **52px** high, **full width**, pill, sans **16px 600**, `nowrap`, in the primary button style, with 6px top margin.

### 3. The timer (one card)
- **Top row:** a flex row with a **14px** gap, items centred.
  - A **72px** ring showing "18:24" in serif 19px.
  - A column with a 3px gap: the "Now" label; the task in serif **17px**; and "From Manifest · Studio · Round 2 of 4" in sans **12px**, muted.
- A hairline.
- **Up next:**
  - the "Up next" label;
  - three checkbox rows with the source on the right, in sans **11px**, muted, `nowrap`;
  - "+ Add a To Do" in sans **13px**, muted.

### 4. Before you start (one card)
- The "This session" label, then three checkbox rows (no source).
- A hairline.
- The "Before you start" label, then **a player row**: a **40px** play circle in the primary style, a 12px gap, then the title in serif **16px** and the meta line in sans **12px**, muted.
- **No arrow and no side-by-side cards.**

### 5. Sound (one card)
- The "Playing while you work" label.
- Chips that wrap (6px gap), with the first two selected.
- **Two level bars side by side** (16px gap). Each is flex 1, a column with a 5px gap: the label in sans 12px, then a **6px** bar filled in accent on a muted track.
- The caption in sans **12px**, muted.

### 6. The timer you'd expect
- **No eyebrow:** the H2 and lead only, then the tiles.
- **A 2-column grid of six tiles** (8px gap).
  - Each tile: padding **11px 12px**, radius **12px**, 1px hairline border, card surface, a column with a 2px gap.
  - The title in serif **15px**, then the detail in sans **12px**, muted.

### 7. Chrome extension (coming soon)
- **The section starts with the pill** "Coming soon · Chrome", in place of the eyebrow:
  - left-aligned;
  - padding **4px 10px**, pill radius;
  - an accent-tinted 1px outline;
  - sans **11px**, uppercase, letter-spacing 1.2px, accent.
- Then the H2, lead and points, as in other sections.
- **Graphic: a browser frame.**
  - Radius **14px**, 1px hairline border, card surface, `overflow: hidden`.
  - **Top bar:**
    - **30px** high, padding 0 12px, with a hairline at the bottom;
    - three **8px** muted dots;
    - a "New tab" tab: padding 3px 10px, radius 5px, on the page background, sans 11px, muted.
  - **Body:** a flex row with a **14px** gap and padding **14px 16px**.
    - A **64px** ring showing "18:24" (serif 17px).
    - Then a column with the "Blocked until the bell" label, followed by three rows. Each row has padding 7px 0 and a hairline on top: the site type in sans **13px** on the left, and "BLOCKED" in sans **10px**, letter-spacing 1.3px, accent, on the right.

### 8. Closing call to action
- Centred, in a column with a **14px gap**.
- **H2:** serif 400, **32px**.
- **Sub:** sans **15px**.
- **Button:** **52px** high, **full width**, pill, sans **16px 600**, in the primary style, with 6px top margin.

## Done when

- At 360px, the page matches `FocusMobile-360.png` in structure, spacing, sizes, alignment and order.
- The hero is centred.
- At 320px, nothing is clipped and there's no horizontal scroll.
- Desktop and the footer are unchanged.
- Send before and after screenshots at 360px, and list the files changed.
