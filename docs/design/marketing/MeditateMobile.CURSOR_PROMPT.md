# Meditate marketing page: mobile layout

## Goal

Make the Meditate marketing page work on phones, **below the existing mobile breakpoint (`md`)**. Match `docs/design/marketing/MeditateMobile.dc.html` and `MeditateMobile-360.png` exactly. Desktop (`md` and up) stays unchanged.

- Use the **same sections, in the same order, with the same copy as the current desktop page**. If the desktop copy differs from the design file, keep the desktop copy.
- Save height by restyling the graphics into the compact stacked versions in the design, not by dropping content.

## How to use the design file

`MeditateMobile.dc.html` is plain HTML with inline styles. **Read its source and port its structure**: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Ignore its `<helmet>`, `<x-dc>` and script wrappers.
- Treat the source as the source of truth for layout.

**Don't add anything the design doesn't have.** That means no extra containers, cards, borders, backgrounds, radii, shadows or padding around groups of elements. Likewise, don't drop anything it does have (hairlines, labels, chips, sliders, play buttons).

## Colours

- **Section backgrounds:** don't take them from the design file. Use the desktop page's own section backgrounds, in the same alternation.
- **Everything else** (cards, hairlines, accent, buttons, chips, bubbles, sliders, text): match the design. Use the desktop token wherever one already plays that role.

## Don't touch

Desktop (`md` and up), the footer, the shared site header's desktop layout, colour tokens, other pages.

## Global (below `md`)

- Side padding is **20px** in every section. No horizontal scroll at 320px.
- Sections are separated by a 1px hairline (top border).
- Section padding is **40px** top and bottom. The hero is the exception (36px top, 40px bottom), and so is the closing CTA (44px).
- **Section structure:** a single column with a **12px gap**, containing, in order:
  1. **eyebrow:** sans **11px**, uppercase, letter-spacing **1.6px**, weight 600, accent;
  2. **H2:** serif 400, **30px**, line-height 1.1;
  3. **lead:** sans **15px**, line-height 1.55, body colour, with 4px extra below it;
  4. the graphic.
- **Cards:** radius **14px**, 1px hairline border, card surface, padding **14px 16px**, a column with a **10px gap**, auto height.
- **Small labels inside cards:** sans **10px**, uppercase, letter-spacing **1.4px**, accent.
- **Chips:** padding **7px 13px**, pill radius, sans **13px**, `nowrap`.
  - Selected chips use the desktop selected-chip style (accent fill, weight 600).
  - Others are outline-only.
- **Play buttons:** circles in the primary button style. **40px** in players, **28px** in session rows.
- **A "player" row:** a flex row with a **12px** gap, the play button, then a column with a 2px gap:
  - the title in serif **16px**;
  - the meta line in sans **12px**, muted.

## Sections

### 1. Header
- **Height 60px.** Padding 0 12px 0 20px, with a 1px hairline at the bottom.
- The sun at 22px, then "consciously" in serif 22px, then the verb "*Meditate*" in serif italic 22px, accent.
- On the right, a **44×44** menu button. No other header buttons on mobile.

### 2. Hero
A column with a **16px gap**:
1. **H1:** serif 400, **40px**, line-height 1.06, letter-spacing −0.6px. The emphasised words keep the desktop accent italic.
2. **Sub:** sans **16px**, line-height 1.5, body colour.
3. **Form:** a column with a **10px** gap and 6px top padding.
   - A visible label, "What would you like a meditation for?", in sans **13px**, muted.
   - **Input:** **52px** high, full width, radius **14px**, padding 0 16px, sans **16px**. Placeholder "e.g. calm before a pitch".
   - **Button** "Create my meditation": **52px** high, full width, pill, sans **16px 600**, `nowrap`, in the primary button style.

### 3. Personal by design
- **Before the card:** the four source chips **wrap** (8px gap). They are "A sentence", "A conversation", "A journal entry" and "A goal you're chasing"; the active one is selected.
- **One card containing:**
  - **three bubbles:**
    - user bubbles are right-aligned, max-width 82%, radius 12px 12px 4px 12px;
    - the assistant bubble is left-aligned, max-width 88%, radius 12px 12px 12px 4px, with a hairline border;
    - all bubbles have padding **9px 13px**, sans **14px**, line-height 1.4;
  - a hairline;
  - a "You get" label;
  - a player row.
- Switching chips swaps the bubbles and the player, as on desktop.
- **No side-by-side cards and no arrow.**

### 4. Styles
- A **2-column grid** with an **8px gap**, holding all **12** style cards.
- **Each card:** radius **12px**, hairline border, card surface, padding **11px 12px**, a column with a **3px gap**.
  - **Top row:** the name in serif **15px** on the left, and a small accent ▶ (9px) on the right.
  - **The one-liner:** sans **12px**, line-height 1.35, muted.
- Tapping a card plays the sample, as on desktop.

### 5. Programs
**One card:**
- the program name in serif **20px**;
- **below it**, the As written / Made for me segmented toggle:
  - left-aligned;
  - padding 3px, on a darker pill;
  - segments padding **5px 11px**, sans **12px**;
  - the active segment uses the selected style;
- the description in sans **13px**, line-height 1.45, body colour;
- **two session rows:** each a flex row with a **12px** gap, padding 9px 0, and a hairline on top.
  - The day in sans **12px**, muted, **40px** wide.
  - The title in serif **15px**.
  - The current session has a **28px** play button on the right.

### 6. Sound
**One card:**
- a "Voice" label, then voice chips that wrap (6px gap);
- a "Background" label, then background chips that wrap;
- **two slider rows** (12px gap, 4px top padding). Each row has:
  - its label in sans **12px**, muted, **74px** wide;
  - a 4px track;
  - a filled part in the primary button colour;
  - a 12px thumb.
- Keep any "[more …]" placeholders exactly as desktop has them.

### 7. Share
- **No lead paragraph**, matching the design.
- **One card** with two parts separated by a hairline.
  - **"Pass it on":**
    - the line in sans **14px**, body colour;
    - **a link pill:**
      - padding 6px 6px 6px 12px, on a darker pill with a hairline border;
      - the URL in sans **12px**, muted, truncated with an ellipsis;
      - a "Copy link" button in the primary style, padding 6px 12px, sans 12px 600.
  - **"Make one for them":**
    - the line in sans 14px;
    - the quote in serif italic **15px**;
    - a player row.

### 8. Closing call to action
- Centred, in a column with a **14px gap**.
- **H2:** serif 400, **32px**.
- **Sub:** sans **15px**.
- **Button:** **52px** high, **full width**, pill, sans **16px 600**, in the primary style, with 6px top margin.

## Done when

- At 360px, the page matches `MeditateMobile-360.png` in structure, spacing, sizes and order.
- At 320px, nothing is clipped and there's no horizontal scroll.
- Desktop and the footer are unchanged.
- Send before and after screenshots at 360px, and list the files changed.
