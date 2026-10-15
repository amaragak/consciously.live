# Manifesto print view: make it pageless

## Scope

This updates the **Manifesto print view you just built**. Only the changes below; everything else stays as it is.

**Don't touch:**
- the Edit view;
- the compose controls;
- the empty state;
- the visual design of the print;
- colour tokens.

## 1. Pageless print

**Remove the fixed page:**
- the fixed **1000 × 1414** design size;
- any fixed height or aspect ratio;
- the "fit" logic that shrinks the prints to make content fit the page.

**Instead:**
- **Width:** the print is drawn **1000px wide** at design size.
- **Height:** it grows vertically with its content. The paper, the grain, the double inner frame and the borders run the full height.
- **Narrower content areas:** scale the print down with a CSS transform, as now. The layout stays identical.
- **Print sizes stay fixed:** they always use the specified sizes (166px base, etc.), so a longer manifesto just makes a longer page.
- **Words to keep:** it follows the life areas with its **30px** top padding. Remove `margin-top: auto`, or anything else that stretches space to fill a page.

**Mobile:** the mobile print is already a scrolling card, so no layout change. Just make sure nothing in it is capped or clipped.

## 2. Show everything

- **Life areas:** show every one.
- **Words to keep:** show **all** notes, not just 4, most recent first, still excluding any with `hiddenOnPrint`. The grid wraps onto as many rows as needed: 4 per row on desktop and 2 on mobile, with an **18px** row gap. Keep the per-note rotation cycle as it is.

## 3. Export

**Remove:** the **PDF · A3** and **PDF · A2** options, and any `@page` size rules.

**The Export menu becomes:**
- **Image (PNG):** capture the **whole** print, at its full length and its 1000px design width, at 2×.
- **Print…:** the browser print dialog, with all app chrome hidden and the print scaled to the page width. Use `break-inside: avoid` on the header block (label, name, statement and values), on each life area row and on each row of notes, so pages break between sections rather than through them.

**Mobile "Save as image":** capture the whole mobile print, at full length, at 3×. Remove the 9:19.5 wallpaper padding.

**Unchanged:** export still renders the **Preview** state, with no compose controls or placeholders.
