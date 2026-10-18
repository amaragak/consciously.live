# Manifest › Vision board: gallery wall, justified mosaic, Feature, crop, Arrange

This replaces the Vision board page layout from the previous prompt. That layout had a title row and counts, a fixed 4-column board grid, a square library grid, and a separate coverage row.

**Keep** everything else from that prompt:
- favourites and the image selection order;
- the Create sheet;
- New take;
- prefilled "Create one";
- the Manifesto hero behaviour.

**Reference:** `docs/design/app/VisionBoard.dc.html` and `VisionBoard.png`. These rows apply:
- Viewing;
- Feature (two examples);
- Arrange;
- Mobile;
- Crop.

The New take and Manifesto hero rows are unchanged from before.

- **Porting:** port px from the HTML source, and ignore the board captions and sample images.
- **Styling:** existing tokens by role only. Use the app's standard chevron at its standard size.
- **Layout:** don't add page titles or new content widths.

---

## 1. Data

```
image { ...existing, width, height }      // natural pixel size; backfill for existing images
boardItem {
  imageId, order,
  featured: boolean,                     // at most one per board
  crop: null | { preset: 'original'|'1:1'|'4:5'|'3:2'|'16:9'|'9:16'|'free',
                 x, y, w, h }            // normalised 0–1 rect within the image
}
```

- **Aspect ratio:** an item's ratio is `crop ? (crop.w*width)/(crop.h*height) : width/height`.
- **Crops are non-destructive:** the library image is never changed. On the board, render the crop with CSS (`object-fit: cover` plus position and scale from the crop rect) or a cropped rendition. Don't change the file.
- **Board limit:** raise it from 8 to **16**.

## 2. Page layout

**Remove:**
- the title row and the counts line;
- the "Your board" header;
- the coverage row;
- the old grids.

The page is now, top to bottom:
1. the **wall**;
2. the **library**;
3. a **floating toolbar**.

### 2.1 Wall

**Container:**
- a dark panel, the same surface as the Manifesto statement panel;
- radius **20px**, padding **14px**;
- a soft drop shadow (`0 18px 40px -18px` at about 45% of the heading colour).

**Inside it:** the board, laid out as **justified rows** (section 3).

**Tiles:** radius **8px**, image covering the tile.
- **Resting state:** no chrome. Favourites show an accent-filled star at **18px**, bottom-right, inset 10px.
- **Hover (desktop) or focus:**
  - a 2px accent ring;
  - a bottom gradient to about 55% of the heading colour, with the life area name in 13px 600 white at the bottom-left, inset 12px;
  - top-right, the existing **32px** "⋯" and star buttons (6px gap).
- **Clicking** opens the image detail as now.

**Empty board:** a single dashed tile on the wall (white at about 35% dashed border, white at about 6% fill), with a plus and "Add". It opens the library filtered to Not on board.

### 2.2 Library

Below the wall, with a **32px** gap.

**One chip row (it wraps):**
- the label "**Library**" (12px caps, letter-spacing 1.6px, 600, label colour);
- **All** {n};
- **★ Favourites** {n};
- **Not on board** {n};
- a 1px divider;
- one chip per life area.

**Area chips double as coverage:**
- **count:** the number of that area's images **on the board**;
- **an area with 0 on the board:** 1.5px **dashed** accent border, accent-tint fill, label-colour text, followed by a plus;
- **clicking** filters the library. **Clicking a dashed (empty) area** opens the prefilled "Create one" sheet for that area, as before.

**Grid:** the library also uses justified rows (target height **150px**, 8px gap), with no wall panel.
- **Tile badges:** as before: star, "On board" chip with a check, versions chip with a layers icon and count.

### 2.3 Floating toolbar

**Position:** bottom centre, fixed above the page, 28px from the bottom. On mobile it sits above the bottom navigation, inset 14px.

**Container:** a pill on card surface, 1px card border, `0 10px 28px` shadow at about 16%, padding 5px, a 4px gap.

**Contents:**
- primary "**Create image**" (40px, sparkle icon);
- "**Upload**" (text button, upload icon);
- a 1px divider;
- "**Arrange**" (text button, layout icon).

**Mobile:** "Create image" stretches, with Upload and Arrange as 44px icon buttons.

**In Arrange mode:**
- the pill shows "Drag to reorder · drag from your library to add" (13px body colour);
- a 1px divider;
- the primary "**Done**".

## 3. Justified rows

**Use** `react-photo-album` (rows layout), or an equivalent.

**Row behaviour:**
- each row shares one height and fills the container width exactly;
- each item keeps its aspect ratio (section 1);
- **last row:** don't stretch it. Keep the target height, left-aligned.

| Breakpoint | Target row height |
|---|---|
| `xl` and up | **210px** |
| `md` | **170px** |
| below `sm` | **110px** (6px gap) |

**Gaps:** 8px (6px on mobile).

**Board order:** items flow in `boardItem.order`. The featured item is taken out and placed in the Feature block (section 4).

## 4. Feature (the board's cover)

**One featured item per board.**
- **Setting it:** "Feature on board" in the tile's ⋯ menu, or the Size control in the Crop dialog.
- **Moving it:** featuring another image moves the Feature, and the previous one returns to normal at its own order.

**Layout (desktop and `md`):**
1. **Block height:** the Feature sits at the **top-left** and spans two rows. Its target block height is `2 × rowHeight + gap`.
2. **Width cap:** if `ratio × blockHeight` would exceed **60%** of the wall's inner width, cap its width at 60% and lower the block height to `cap / ratio`.
3. **Beside it:** fill **two justified rows** into the remaining width (`inner − featureWidth − gap`), taking items in order. Each row targets `(blockHeight − gap) / 2`.
4. **Final height:** the block's height is the sum of those two rows' actual heights plus the gap. The Feature renders at that height with `object-fit: cover`, so any crop from the cap is minimal.
5. **Below:** the remaining items continue as normal justified rows.

**Mobile:** the Feature is a full-width row on its own at its own ratio, then the normal rows.

In Arrange mode the Feature tile shows a dark "**Feature**" chip at the bottom-left.

## 5. Arrange mode

**Entry:** the toolbar's Arrange button. Use `@dnd-kit`, or the existing drag library.

**Every board tile shows:**
- top-left, a **30px** grip button (white at about 90%, radius 8px);
- top-right, **30px** "Crop" and "⋯" buttons.

**Labels (Arrange mode only):**
- **Feature chip** on the featured tile.
- **Crop chip** on cropped tiles: crop icon plus the preset, e.g. "16:9", bottom-right.

**Dragging:**
- the dragged tile stays in place at **35%** opacity;
- a **4px accent insertion bar** (with a 3px soft accent glow) shows where it will land;
- the rows reflow live.
- **Dropping** updates `order`.
- **The Feature can't be dragged out of the top-left;** reorder the other items around it.

**From the library:** in Arrange mode, library tiles get a grab cursor and a 1px light-accent ring.
- **Dragging a tile onto the wall** adds it at the drop position, up to the 16-item limit. At the limit, show the app's toast "Your board is full. Remove one to add another."
- **Without dragging:** "Add to board" in the library tile menu appends the image to the end.

**Done** (or Escape) leaves Arrange mode.

## 6. Crop dialog

**Opening:** the tile's Crop button (Arrange mode), or "Crop" in any ⋯ menu. Use `react-easy-crop`.

**Dialog:** **620px** wide, radius 20px, padding 24px 30px, a 16px gap.

**Contents:**
1. **Title row:** "**Crop**" (serif 24px) and ×.
2. **Preset chips** (32px, padding 0 13px, 13px 600; selected in heading colour with white text):
   - **Original · 1:1 · 4:5 · 3:2 · 16:9 · 9:16 · Free**.
   - Switching preset redraws the frame and keeps it centred on the current crop.
3. **Crop area:** the image fitted to the dialog width.
   - **Frame:** a 1px white outline, with the outside dimmed to about 62% of the heading colour.
   - **Guides:** rule-of-thirds lines (white at about 45%).
   - **Corner marks:** 18px L-shaped, 3px white.
   - **Moving:** drag to reposition.
   - **Free preset:** the corners resize the frame.
4. **Zoom:** "Zoom", a slider (track in progress-track colour, accent fill, 16px thumb with a 2px accent border), and the percentage.
5. **Size on board:** a segmented control **Normal · Feature**.
6. **Footer:**
   - left, "**Reset to original**" (refresh icon, 13px 600 label colour), which sets `crop = null`;
   - right, an outline "**Cancel**" and the primary "**Apply**".

**Apply** saves `crop` (and `featured`), and the wall reflows.

## Don't change

- Favourites, the image selection order everywhere, and the Manifesto hero behaviour.
- The Create sheet, New take, and prefilled Create one.
- Generation, upload, versions and references logic.
