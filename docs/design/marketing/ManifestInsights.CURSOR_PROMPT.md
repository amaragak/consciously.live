# Manifest marketing page: new "Thoughts and insights" section (desktop and mobile)

## Goal

Replace the **Thoughts and insights** section of the Manifest marketing page, on **desktop and mobile**. Apply this on top of the current page; nothing else on the page changes.

- The old graphic (the list of tagged thoughts plus "What's not" / "What's working") goes.
- The new graphic is an **insights card**: pace, what's been done, and how you feel about it.

**References:**
- **Desktop:** the "Thoughts and insights" section of `docs/design/marketing/ManifestPage.dc.html`, and `ManifestPage-insights.png`.
- **Mobile:** the same section in `docs/design/marketing/ManifestMobile.dc.html`, and `ManifestMobile-insights.png`.

Both design files are plain HTML with inline styles. **Read their source for this section and port its structure**: the same elements, nesting, borders, radii, padding, gaps and font sizes.
- Ignore the `<helmet>`, `<x-dc>` and script wrappers.
- Don't add anything the design doesn't have, and don't drop anything it has.

## Colours

- Don't take section backgrounds from the design files. Keep the section's current background.
- Everything else (card, hairlines, accent, bar, sparkline, chips, text): match the design, using the existing token for each role.

## Don't touch

Every other section, the header, the footer, colour tokens, other pages.

## Copy (desktop and mobile)

- **Eyebrow:** "Thoughts and insights". **H2:** "It notices what you don't." (both unchanged)
- **Lead:** "Jot thoughts as they come: wins, blockers, resistance. Insights shows how fast you're moving, what you've done, and how you feel about it."
- **Points:**
  - **Pace and progress:** "How quickly you're moving, and what you've finished this month."
  - **How you feel about it:** "The mood of your thoughts on each topic, and how it's shifting."

## Desktop graphic (`md` and up)

Keep the section's current side-by-side layout and side. The graphic is **one card**: padding **24px 26px**, a column with an **18px gap**.

**Small labels:** sans **11px**, uppercase, letter-spacing **1.4px**, accent.

1. **Header row** (space-between, baseline aligned, wraps if needed):
   - left: "Studio" in serif **18px**, then " · last 30 days" in serif **14px**, muted;
   - right: "From 14 To Dos, 9 thoughts, 3 entries" in sans **12px**, muted.
2. **Pace** (a column with an 8px gap):
   - the "Pace" label;
   - a row with "5 of 9 steps" (sans 15px) on the left, and "1.5 a week ↑ from 0.8" (sans 13px) on the right. The ↑ is in accent and "from 0.8" is muted;
   - an **8px** bar with pill ends on a muted track, **55%** filled in accent;
   - "At this pace, about 3 months to opening night" in sans **13px**, muted.
3. A 1px hairline.
4. **Two columns** (`1fr 1fr`, **24px** gap):
   - **Done** (a column with a 6px gap):
     - the "Done" label;
     - **three rows.** Each has padding **6px 0**, a 1px hairline on top, items aligned on the baseline and a 10px gap: an accent ✓ (12px), the text in sans **14px** (flex 1), and the date on the right in sans **12px**, muted, `nowrap`. The rows are:
       - "Finished twelve pieces", 18 Sept;
       - "Booked the kiln", 24 Sept;
       - "Photographed the first six", 29 Sept;
     - "11h Focus · 4 visualisations · 2 wins" in sans **12px**, muted.
   - **How you feel about it** (a column with an 8px gap):
     - the label;
     - **a sparkline, 44px tall and full width:** a dashed muted midline, and a 2px accent line rising left to right, ending in a small accent dot;
     - an axis row (space-between, sans **11px**, muted): "2 Sept" and "Today · more hopeful";
     - **topic chips** that wrap (6px gap). Each chip has padding **5px 10px**, pill radius, a 1px outline and sans **12px** text: the topic in heading colour, then its mood. The chips are:
       - "Making hopeful": accent outline, mood in accent;
       - "Pricing tense → steadier": muted outline, mood muted;
       - "Showing work anxious": muted outline, mood muted.
5. A 1px hairline.
6. **Summary:** "You're moving faster since you started the visualisations, and pricing feels less tense than in August." in serif italic **17px**, line-height 1.45.

## Mobile graphic (below `md`)

Same section structure as the other mobile sections: eyebrow, H2, lead, points, then the card. The card is **one compact card**: radius **14px**, 1px hairline border, padding **14px 16px**, a column with a **10px gap**.

**Small labels:** sans **10px**, uppercase, letter-spacing **1.4px**, accent.

1. **Title:** "Studio" in serif **16px**, then " · last 30 days" in serif **13px**, muted. No sources line.
2. **Pace** (a column with a 6px gap):
   - a row (space-between) with "5 of 9 steps" and "1.5 a week ↑" in sans **13px**, with the ↑ in accent;
   - a **6px** bar, 55% filled in accent;
   - "3 done · 11h Focus · 4 visualisations" in sans **12px**, muted.
3. A 1px hairline.
4. **Feeling** (a column with an 8px gap):
   - a row (space-between, items centred): the "Feeling" label on the left; on the right, a tiny sparkline (**64×18px**, a 2px accent line, no midline or dot) followed by "more hopeful" in sans **11px**, muted;
   - topic chips, the same as desktop except that Pricing reads just "steadier": "Making hopeful" (accent), "Pricing steadier", "Showing work anxious".
5. **Summary:** "Moving faster since the visualisations; pricing feels steadier." in serif italic **14px**, line-height 1.4.

**No Done list and no "At this pace" line on mobile.**

## Accessibility

- The sparklines are decorative (`aria-hidden`). The "more hopeful" text carries the meaning.
- The progress bars have `role="img"` with an `aria-label` such as "5 of 9 steps done".
- The chips aren't interactive.

## Done when

- On desktop, the section matches `ManifestPage-insights.png`. At 360px, it matches `ManifestMobile-insights.png`.
- At 320px, nothing is clipped and there's no horizontal scroll.
- The old thoughts list and the "What's not" / "What's working" graphic are gone, along with any components left unused.
- No other section has changed.
- Send desktop and 360px screenshots of the section, and list the files changed.
