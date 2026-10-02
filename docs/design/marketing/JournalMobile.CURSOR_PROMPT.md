# Journal marketing page: mobile layout

## Goal

Make the Journal marketing page work on phones, **below the existing mobile breakpoint (`md`)**. Match `docs/design/marketing/JournalMobile.dc.html` and `JournalMobile-360.png` exactly. Desktop (`md` and up) stays unchanged.

- Use the **same sections, in the same order, with the same copy as the current desktop page**, including each section's two sub-points. If the desktop copy differs from the design file, keep the desktop copy.
- Save height by restyling the graphics into the compact stacked versions in the design, not by dropping content.

## Copy change (desktop and mobile)

The "Write or speak" section doesn't say that voice entries are transcribed. Change this copy **on both desktop and mobile**. It's the one desktop change in this task.
- **Lead:** "A careful paragraph, or a voice note on the walk home that's transcribed for you. Same private page."
- **"Speak" point:** "Talk it out. It's transcribed as you go, and the recording stays with the words."
- **Spoken card label:** "Spoken, 08:12 · transcribed"
- **Spoken card caption:** "Transcribed for you. Your voice stays with the words."

If transcription isn't actually live in the app, don't make this change. Tell me instead.

## How to use the design file

`JournalMobile.dc.html` is plain HTML with inline styles. **Read its source and port its structure**: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Ignore its `<helmet>`, `<x-dc>` and script wrappers.
- Treat the source as the source of truth for layout.

**Don't add anything the design doesn't have.** That means no extra containers, cards, borders, backgrounds, radii, shadows or padding around groups of elements. Likewise, don't drop anything it does have (hairlines, labels, dotted underlines, bars, chips, play buttons).

## Colours

- **Section backgrounds:** don't take them from the design file. Use the desktop page's own section backgrounds, in the same alternation.
- **Everything else** (cards, hairlines, accent, buttons, chips, bars, waveform, text, page thumbnails): match the design. Use the desktop token wherever one already plays that role.

## Don't touch

Desktop (`md` and up), apart from the copy change above. Also leave the footer, colour tokens and other pages alone. The mobile menu is handled separately.

## Global (below `md`)

- Side padding is **20px** in every section. No horizontal scroll at 320px.
- Sections are separated by a 1px hairline (top border).
- Section padding is **40px** top and bottom. The hero is the exception (36px top, 40px bottom), and so is the closing CTA (44px).
- **Section structure:** a single column with a **12px gap**, containing, in order:
  1. **eyebrow:** sans **11px**, uppercase, letter-spacing **1.6px**, weight 600, accent;
  2. **H2:** serif 400, **30px**, line-height 1.1;
  3. **lead:** sans **15px**, line-height 1.55, body colour, with 4px extra below it;
  4. **sub-points:** a column with a **10px** gap, 4px bottom padding. Each point is a column with a 2px gap: its title in serif **17px**, heading colour, then its text in sans **14px**, line-height 1.5, muted;
  5. the graphic card.
- **Cards:** radius **14px**, 1px hairline border, card surface, padding **14px 16px**, a column with a **10px gap**, auto height. Use one card per section; sub-parts are divided by a 1px hairline inside the card, not split into separate cards.
- **Small labels inside cards:** sans **10px**, uppercase, letter-spacing **1.4px**, accent.
- **Quotes:** serif italic **15px**, line-height 1.45, heading colour.
- **Captions:** sans **12px**, muted.
- **Body text in cards:** sans **14px**, line-height 1.5, body colour.
- **Chips:** padding **7px 13px**, pill radius, sans **13px**, `nowrap`. The selected chip uses the desktop selected style (accent fill, weight 600); the others are outline-only.
- **Play buttons:** circles in the primary button style. **40px** in players, **28px** inline.
- **A "player" row:** a flex row with a **12px** gap, the play button, then a column with a 2px gap: the title in serif **16px**, then the meta line in sans **12px**, muted.
- **Bars:** each one is a column with a 4px gap. The label is sans 12px, body colour. The bar is **6px** high with pill ends, on a muted track; the first bar's fill is accent and the others are muted.

## Sections

### 1. Header
- **Height 60px.** Padding 0 12px 0 20px, with a 1px hairline at the bottom.
- The sun at 22px, then "consciously" in serif 22px, then the verb "*Journal*" in serif italic 22px, accent.
- On the right, a **44×44** menu button.

### 2. Hero
A column with a **16px gap**:
- **H1:** serif 400, **40px**, line-height 1.06, letter-spacing −0.6px.
- **Sub:** sans **16px**, line-height 1.5, body colour.
- **Button** "Write your first entry": **52px** high, **full width**, pill, sans **16px 600**, `nowrap`, in the primary button style, with 6px top margin.

### 3. Write or speak (one card)
- **Typed part:**
  - the "Typed, 22:41" label;
  - the title in serif **17px**;
  - one paragraph of body text.
- A hairline.
- **Spoken part:**
  - the "Spoken, 08:12" label;
  - a row with a **10px** gap: a **28px** play button, a waveform (3px bars with a 3px gap, 20px tall, flex 1; the first five bars are accent, the rest muted), and the duration in sans 12px, muted;
  - the transcript as body text;
  - the caption "Your voice, kept with the words."

### 4. Insights (one card)
- **Entries part:**
  - the "Your entries" label;
  - two quotes, with key phrases underlined in a **dotted accent line, 3px offset**;
  - the dates caption.
- A hairline.
- **Patterns part:**
  - the "Patterns this month" label;
  - **four bars in a 2×2 grid** (10px row gap, 12px column gap);
  - the "From 9 entries" caption;
  - "Turn this into a meditation →" in sans **13px 600**, accent.

### 5. Journal → Meditate (one card)
- **Entry part:**
  - the "Tonight's entry" label;
  - the quote;
  - a left-aligned "Make a meditation" pill in the primary style: padding **7px 14px**, sans **13px 600**.
- A hairline.
- **Result part:** the "You get" label, then a player row.

### 6. Gratitudes (one card)
- The "Today" label.
- Four rows. Each row:
  - is a flex row with a **10px** gap, items aligned on the baseline;
  - has padding **9px 0** and a 1px hairline on top;
  - shows an accent ✦ at 12px, then the gratitude as a quote.
- The date caption.

### 7. Bring your past (one card)
- **Paper part:**
  - the "Paper pages" label;
  - **three page thumbnails in a row**, 6px gap. Each is flex 1, **72px** high, radius **8px**, with "page n" in serif italic 12px at the bottom left. Fill them exactly as the desktop thumbnails are filled.
  - the caption "We read the handwriting. You check it."
- A hairline.
- **Import part:**
  - the "Or import" label;
  - format chips that wrap (6px gap), with the first one selected.

### 8. Closing call to action
- Centred, in a column with a **14px gap**.
- **H2:** serif 400, **32px**.
- **Sub:** sans **15px**.
- **Button:** **52px** high, **full width**, pill, sans **16px 600**, in the primary style, with 6px top margin.

## Done when

- At 360px, the page matches `JournalMobile-360.png` in structure, spacing, sizes and order.
- At 320px, nothing is clipped and there's no horizontal scroll.
- Desktop and the footer are unchanged, apart from the Write or speak copy.
- Send before and after screenshots at 360px, and list the files changed.
