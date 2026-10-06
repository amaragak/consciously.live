# Create · Start: tile row sizing

## Goal
Fix the sizing of the Format and Context tiles on the Create **Start** step.
- **The problem:** the tiles are fixed at about 175px with square images, so the row stops well short of the composer's right edge, the text wraps to 3–4 lines, and the gaps are uneven.
- **The fix:** make the row span the same width as the composer card above it, with wider cards and 4:3 images.

Keep everything else about the tiles as it is now: the images, copy, + button, border, radius, shadow and type styles.

## Colours
No new colours. The Format group's background uses the subtle tint token already used for the segmented-control track.

## Don't touch
The composer, the H1 and sub-line, the footer, the Shape and Sound steps, and the tile copy and styling (apart from what's listed below).

## Changes

### Row and groups
- **Row:** the tile row spans the **same width as the composer card** above it. It's a flex row with the two groups side by side, a **24px** gap between them, items aligned to the top.
- **Groups:** each group (Format, Context) is `flex: 1`, `min-width: 0`, so the two halves are equal.
- **Group label:** the label line stays as it is ("FORMAT · pick one" / "CONTEXT · add any").

### Surprise me
- Move "**Surprise me**" from its own line onto the group-label line, aligned right at the end of the Context group's label row. Keep its existing style.
- Remove the separate line that held it.

### Tiles inside each group
- **Group container:** a flex row with a **12px** gap between its two tiles.
- **Tiles:** each is `flex: 1`, `min-width: 0`. No fixed tile width.
- **Format wrapper:** keep it, with padding **8px**, radius **14px** and the tint background. Make sure the tint actually renders.
- **Context group:** also gets padding **8px**, with no background, so its tiles line up vertically with the Format tiles.

### "or" badge
- Take it out of the layout flow. Position it **absolutely**, centred on the gap between Style and Program (horizontally on the 12px gap, vertically on the image area), above the tiles.
- The gap between Style and Program is then the same 12px as between Journal and Goal.

### Images
- Change the tile image from square to **`aspect-ratio: 4 / 3`**, `width: 100%`, `object-fit: cover`, `object-position: center 40%`.

### When tiles drop out
- **One tile left in a group:** it keeps **half the group's width** (`flex: 0 0 calc(50% - 6px)`); it doesn't stretch to fill.
- **A whole group hidden:** the other group stays at **half the row**, left-aligned.

### Mobile (below `md`)
- **Layout:** the groups stack (Format, then Context), each a 2-column row of tiles with an **8px** gap and 4:3 images.
- **Surprise me:** sits at the right of the Format label line.

## Done when
- **Wide screens:** the tile row's right edge lines up with the composer's right edge. The four tiles are equal width, with descriptions at about 2 lines.
- **Gaps:** Style ↔ Program and Journal ↔ Goal are the same 12px, and the "or" badge floats over the Format gap.
- **Format tint:** it's visible behind Style and Program.
- **Surprise me:** it sits on the label line, and the extra blank line is gone.
- **Dropping out:** when tiles drop out, the remaining ones keep their width.
- **Report back:** list the files changed.
