# Manifest marketing page: mobile layout

## Goal

Make the Manifest marketing page work on phones, **below the existing mobile breakpoint (`md`)**. Match `docs/design/marketing/ManifestMobile.dc.html` and `ManifestMobile-360.png` exactly. Desktop (`md` and up) stays unchanged.

- Use the **same sections, in the same order, with the same copy as the current desktop page**, including each section's two sub-points. If the desktop copy differs from the design file, keep the desktop copy.
- Save height by restyling the graphics into the compact stacked versions in the design, not by dropping content.

## How to use the design file

`ManifestMobile.dc.html` is plain HTML with inline styles. **Read its source and port its structure**: the same elements, nesting, borders, radii, padding, gaps, alignment and font sizes.
- Ignore its `<helmet>`, `<x-dc>` and script wrappers.
- Treat the source as the source of truth for layout.

**Don't add anything the design doesn't have.** That means no extra containers, cards, borders, backgrounds, radii, shadows or padding around groups of elements. Likewise, don't drop anything it does have (hairlines, labels, chips, bands, checkboxes, the ring, tags).

## Colours

- **Section backgrounds:** don't take them from the design file. Use the desktop page's own section backgrounds, in the same alternation.
- **Everything else** (cards, hairlines, accent, buttons, chips, bands, checkboxes, ring, tags, text): match the design. Use the desktop token wherever one already plays that role.

## Don't touch

Desktop (`md` and up), the footer, colour tokens, other pages. The mobile menu is handled separately.

## Global (below `md`)

- Side padding is **20px** in every section. No horizontal scroll at 320px.
- Sections are separated by a 1px hairline (top border).
- Section padding is **40px** top and bottom. The hero is the exception (40px top, 44px bottom), and so is the closing CTA (44px).
- **Section structure** (every section except the hero and CTA): a single **left-aligned** column with a **12px gap**, containing, in order:
  1. **eyebrow:** sans **11px**, uppercase, letter-spacing **1.6px**, weight 600, accent;
  2. **H2:** serif 400, **30px**, line-height 1.1;
  3. **lead:** sans **15px**, line-height 1.55, body colour, with 4px extra below it;
  4. **sub-points:** a column with a **10px** gap, 4px bottom padding. Each point is a column with a 2px gap: its title in serif **17px**, heading colour, then its text in sans **14px**, line-height 1.5, muted;
  5. the graphic.
- **Cards:** radius **14px**, 1px hairline border, card surface, padding **14px 16px**, a column with a **10px gap**, auto height. Use one card per section; sub-parts are divided by a 1px hairline inside the card.
- **Small labels inside cards:** sans **10px**, uppercase, letter-spacing **1.4px**, accent.
- **Quotes:** serif italic **15px**, line-height 1.45.
- **Body text in cards:** sans **14px**, line-height 1.5, body colour.
- **Chips:** padding **7px 13px**, pill radius, sans **13px**, `nowrap`. The selected chip uses the desktop selected style; the others are outline-only.

## Sections

### 1. Header
- **Height 60px.** Padding 0 12px 0 20px, with a 1px hairline at the bottom.
- The sun at 22px, then "consciously" in serif 22px, then the verb "*Manifest*" in serif italic 22px, accent.
- On the right, a **44×44** menu button.

### 2. Hero (centred)
- **The hero stays centred, as on desktop:** `text-align: center`, with items centred.
- A column with a **16px gap**:
  - **H1:** serif 400, **40px**, line-height 1.06, letter-spacing −0.6px.
  - **Strapline:** sans **16px**, line-height 1.5, body colour, **centred**.
  - **Button** "Build your vision board": **52px** high, **full width**, pill, sans **16px 600**, `nowrap`, in the primary button style, with 6px top margin.

### 3. Vision board
**The graphic is not a card. It's a collage block:**
- **200px** high, radius **14px**, 1px hairline border, `overflow: hidden`;
- inside, a **3×2 grid** with a 4px gap and 4px padding on the card surface;
- each tile has radius **8px** and holds an image, `object-fit: cover`. Use the same vision-board images as desktop;
- centred over it, a panel **82%** wide:
  - padding **12px 14px**, radius **12px**, the same translucent dark treatment as the desktop overlay;
  - centred text: the manifesto line in serif italic **15px**, then the caption in sans **11px**, muted, with a 6px gap.

### 4. Manifesto (one card)
- **Values part:**
  - the "Values" label;
  - four rows. Each row has padding **6px 0** and a 1px hairline on top, with items aligned on the baseline and a 12px gap: the number in sans **11px**, muted, then the value in serif **18px**.
- A hairline.
- **Question part:**
  - the "A question to yourself" label;
  - the question as a quote;
  - the answer as body text, with a **2px accent left rule** and 12px left padding.

### 5. Life areas (one card)
- Area chips that wrap (6px gap), with the first one selected.
- **Three bands.** Each band:
  - has padding **10px 12px**, radius **10px**, a 1px hairline border, and is a column with a 4px gap;
  - shows a label, then a quote.
- **The "What's in the way" band is highlighted:** an accent-tinted border and a slightly raised surface, as on desktop.

### 6. Goals and To Dos (one card)
- The "Studio · Goal" label, then the goal title in serif **17px**.
- **Four To Dos** in a column with a **9px** gap. Each To Do is a flex row with a 10px gap, sans **14px**, and a **14px** checkbox with a 4px radius.
  - **Done:** filled with accent, text muted and struck through.
  - **Next:** an accent outline, with a small accent "Next" label (sans 11px) pushed to the right.
  - **Others:** a muted outline.
- **Obstacle box:**
  - padding **10px 12px**, radius **10px**, 1px hairline border, a column with a 3px gap;
  - the prompt in sans **12px**, muted;
  - the answer as a quote.

### 7. Meditate and Focus (one card)
- **Meditate part:**
  - the "consciously Meditate" label;
  - a player row: a **40px** play circle in the primary style, a 12px gap, then the title in serif 16px and the meta line in sans 12px, muted.
- A hairline.
- **Focus part:**
  - the "consciously Focus" label;
  - a row with a **14px** gap:
    - a **64px progress ring** (4px stroke, accent arc on a muted track) with the time in serif **17px**;
    - the task in serif **16px**, with the caption in sans **12px**, muted, under it.

### 8. Thoughts and insights (one card)
- **Thoughts part:**
  - the "Thoughts" label;
  - three rows. Each row has padding **8px 0** and a 1px hairline on top, with items aligned on the baseline and a 10px gap:
    - the date in sans **11px**, muted, **40px** wide;
    - the text in sans **14px**, flex 1;
    - an outline tag: padding 2px 8px, pill, sans 11px.
- A hairline.
- **Insight part:**
  - the "What's not" label, then body text;
  - the "What's working" label, then body text.

### 9. Closing call to action
- Centred, in a column with a **14px gap**.
- **H2:** serif 400, **32px**.
- **Sub:** sans **15px**.
- **Button:** **52px** high, **full width**, pill, sans **16px 600**, in the primary style, with 6px top margin.

## Done when

- At 360px, the page matches `ManifestMobile-360.png` in structure, spacing, sizes, alignment and order.
- The hero is centred.
- At 320px, nothing is clipped and there's no horizontal scroll.
- Desktop and the footer are unchanged.
- Send before and after screenshots at 360px, and list the files changed.
