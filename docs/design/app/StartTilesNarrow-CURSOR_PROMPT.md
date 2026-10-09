# Start step: row tiles below `md`

## Scope

**Below Tailwind `md`:** the Start step's Format and Context tiles switch to a compact horizontal "row tile". **At `md` and up**, nothing changes.

**Breakpoints:** use only `md` and the existing `sm`. Don't add new breakpoints.

**Don't touch:**
- the composer, the header, the footer, the sidebar;
- the tiles' behaviour (add, select, check, the "or" exclusivity, dropping out once added);
- other steps and pages;
- colour tokens.

## Reference

`docs/design/app/StartTilesNarrow.dc.html` and `StartTilesNarrow.png` show two widths:
- **Left:** `sm` to `md`.
- **Right:** below `sm`.

Port the tile and grid structure, and the px, from the HTML source. Ignore everything outside the Format and Context groups.

## Colours

Use the existing tokens, the same as the current tiles:
- card surface and card border;
- serif heading and muted description;
- the accent border and the check overlay for the selected tile;
- the Format group's existing tinted background;
- the existing "or" badge;
- the existing + button.

## Below `md`

**Groups**
- Format and Context stack vertically, as they already do.
- Each group label keeps its row. "Surprise me" stays on the Format label line.

**Grid inside each group**
- **`sm` to `md`:** two columns, `repeat(2, minmax(0,1fr))`, **12px** gap.
- **Below `sm`:** one column, **12px** gap.
- The Format group keeps its tinted background with **6px** padding. Context keeps **0 6px** padding so the tiles line up.

**Row tile** (replaces the tall tile below `md`)
- **Container:** `display: flex`, items stretch, **88px** high, radius **12px**, overflow hidden. Selected: a **1.5px** accent border. Otherwise 1px card border.
- **Image:** **88×88** on the left, flush with the tile edge, `object-fit: cover` with the existing `object-position`. It's the same square image the tall tile uses. When selected, the existing check overlay sits centred on the image.
- **Text column:** flex 1, `min-width: 0`, padding **10px 34px 10px 12px**, centred vertically, **3px** gap.
  - title: serif **16px**;
  - description: **12px**, line-height 1.35, muted, clamped to **2 lines**.
- **+ button:** absolutely positioned at top **8px** / right **8px**, **24px**, with the existing styling. Hide it when selected, as now.
- **Dimmed:** the unselected Format tile keeps its current dimmed treatment when the other one is selected.

**"Or" badge**
- `sm` to `md`: centred between the two Format tiles horizontally, as now.
- Below `sm`: centred between them vertically, overlapping the gap. Same badge.

## At `md` and up

Leave the current tall tiles and the four-across layout exactly as they are.
