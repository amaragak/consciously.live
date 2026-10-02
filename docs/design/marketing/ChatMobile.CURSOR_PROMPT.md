# Chat marketing page: mobile layout

## Goal

Make the Chat marketing page work on phones, **below the existing mobile breakpoint (`md`)**. Match `docs/design/marketing/ChatMobile.dc.html` and `ChatMobile-360.png` exactly. Desktop (`md` and up) stays unchanged.

- Use the **same sections, in the same order, with the same copy as the current desktop page**, including each section's sub-points and the small print under the CTA. If the desktop copy differs from the design file, keep the desktop copy.
- Save height by restyling the graphics into the compact stacked versions in the design, not by dropping content.

## How to use the design file

`ChatMobile.dc.html` is plain HTML with inline styles. **Read its source and port its structure**: the same elements, nesting, borders, radii, padding, gaps, alignment and font sizes.
- Ignore its `<helmet>`, `<x-dc>` and script wrappers.
- Treat the source as the source of truth for layout.

**Don't add anything the design doesn't have.** That means no extra containers, cards, borders, backgrounds, radii, shadows or padding around groups of elements. Likewise, don't drop anything it does have (hairlines, labels, context chips, result rows, the "Talk it over" pill).

## Colours

- **Section backgrounds:** don't take them from the design file. Use the desktop page's own section backgrounds, in the same alternation.
- **Everything else** (cards, hairlines, accent, buttons, bubbles, chips, result rows, text): match the design. Use the desktop token wherever one already plays that role. Bubbles use the same styles as the desktop bubbles.

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
- **Bubbles:** padding **9px 13px**, sans **14px**, line-height 1.4.
  - **User:** right-aligned, max-width **82%**, radius **12px 12px 4px 12px**.
  - **Assistant:** left-aligned, max-width **88%**, radius **12px 12px 12px 4px**, with a 1px hairline border.

## Sections

### 1. Header
- **Height 60px.** Padding 0 12px 0 20px, with a 1px hairline at the bottom.
- The sun at 22px, then "consciously" in serif 22px, then the verb "*Chat*" in serif italic 22px, accent.
- On the right, a **44×44** menu button.

### 2. Hero (centred)
- **The hero stays centred, as on desktop:** `text-align: center`, with items centred.
- A column with a **16px gap**:
  - **H1:** serif 400, **40px**, line-height 1.06, letter-spacing −0.6px.
  - **Strapline:** sans **16px**, line-height 1.5, body colour, centred.
  - **Button** "Talk to your coach": **52px** high, **full width**, pill, sans **16px 600**, `nowrap`, in the primary button style, with 6px top margin.

### 3. Your coach (one card)
- **A context row** that wraps (6px gap, items centred):
  - "Read:" in sans **11px**, muted;
  - then outline chips: padding **4px 9px**, pill radius, sans **11px**, body colour, `nowrap`.
- A user bubble, then an assistant bubble.

### 4. Actions (one card)
- A user bubble, then an assistant bubble.
- **Three result rows** in a column with a **6px** gap. Each row:
  - is a flex row with a **10px** gap, items centred;
  - has padding **9px 12px**, radius **10px**, a 1px hairline border, and the slightly darker alternate surface;
  - shows a small label at a fixed **64px** width, the text in sans **13px** (flex 1, `min-width: 0`), and the action in sans **12px 600**, accent, `nowrap`, on the right.
- Shorten the Manifest row text to "3 next steps added" on mobile.

### 5. Journal (one card)
- **Entry part:**
  - the "Journal · Thu 25 Sept" label;
  - the quote in serif italic **15px**;
  - a left-aligned "Talk it over" pill in the primary style: padding **7px 14px**, sans **13px 600**.
- A hairline.
- A user bubble, then an assistant bubble.
- **No arrow and no side-by-side cards.**

### 6. Memory (one card)
- The "Continues from Tuesday" label.
- A user bubble, then an assistant bubble.

### 7. Closing call to action
- Centred, in a column with a **14px gap**.
- **H2:** serif 400, **32px**.
- **Sub:** sans **15px**.
- **Button:** **52px** high, **full width**, pill, sans **16px 600**, in the primary style, with 6px top margin.
- **Small print:** 14px top margin, 14px top padding, a 1px hairline on top. Sans **12px**, line-height 1.5, muted, centred.

## Done when

- At 360px, the page matches `ChatMobile-360.png` in structure, spacing, sizes, alignment and order.
- The hero is centred.
- At 320px, nothing is clipped and there's no horizontal scroll.
- Desktop and the footer are unchanged.
- Send before and after screenshots at 360px, and list the files changed.
