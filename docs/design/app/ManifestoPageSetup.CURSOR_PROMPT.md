# Manifest › Manifesto (poster view): page setup, paged or pageless, with sizes

The poster view behaves differently by screen size:
- **Desktop:** one fixed A-ratio page.
- **Mobile:** reflows into a scrolling column. "Save as image" then still exports a different layout from what's on screen.

Add a **Page** setting so the user chooses the format. Whatever is on screen is exactly what is saved.

**Reference:** `docs/design/app/ManifestoPageSetup.dc.html` and `ManifestoPageSetup.png`. Port px from the HTML source and ignore the board captions and sample content. The existing print styling (paper, grain, frame, chapters, notes) is unchanged. The board reuses it.

**Styling:**
- **Colours:** existing tokens by role only.
- **Chevrons:** the app's standard chevron at its standard size.

---

## 1. Setting

```
manifestoPage: {
  mode: 'paged' | 'pageless',
  size: 'a' | 'letter' | 'tabloid' | 'phone'   // used when paged
}
```

- **Saving:** persist per user. Store `mode` separately for phone-width (below `sm`) and for larger screens, so a phone default doesn't change desktop. `size` is shared.
- **Defaults:**
  - **Mode:** `pageless` below `sm`, `paged` from `sm` up.
  - **Size:** `letter` if the user's region is US or CA (use the locale already used for formatting), otherwise `a`.

## 2. Sizes

| Key | Label | Sub-label | Ratio (w : h) | Logical page (px) | Export (px) |
|---|---|---|---|---|---|
| `a` | A4 / A3 | Standard | 1 : 1.414 | 1000 × 1414 | 3508 × 4961 (A3 at 300 dpi; prints sharp at A4 too) |
| `letter` | Letter | 8.5 × 11 | 1 : 1.294 | 1000 × 1294 | 2550 × 3300 |
| `tabloid` | Tabloid | 11 × 17 | 1 : 1.545 | 1000 × 1545 | 3300 × 5100 |
| `phone` | Phone | Wallpaper | 9 : 19.5 | 540 × 1170 | 1290 × 2796 |

**Tiles shown by region** (the others sit behind "More sizes"):
- **US / CA:** Letter, Tabloid, Phone.
- **Everyone else:** A4 / A3, Phone.

**More sizes** (12px, 600, label colour, chevron) expands the tile row in place to show the rest. If the selected size is a hidden one, show all tiles.

## 3. Page card (desktop)

**Position:** in the poster view's action column, between Export and Arrangement, matching that column's width.

**Container:** card surface, 1px card border, radius **16px**, padding **14px**, a column with a **12px** gap.

**Contents:**
1. "**Page**": 10px caps, letter-spacing 1.4px, 600, muted.
2. A **Paged / Pageless** segmented control: progress-track pill, padding 3px, 13px 600. The active segment is card surface with a small shadow. Segments share the width equally.
3. **When Paged:**
   - "Size" in 12px, 600, muted;
   - the tiles in a row with a **6px** gap;
   - then More sizes.
4. **When Pageless:** instead of the size block, "One continuous sheet that fits your screen. Saves as a single tall image." in 12px muted.

**Size tile:** `flex: 1`, a column, items centred, a 6px gap, padding **10px 4px 8px**, radius **12px**.
- **Contents:**
  - a 34px-high slot holding a page outline drawn at the size's ratio: 22px wide, or 34px tall if taller, with a 1.5px border and radius 2px;
  - the label in 12px, 600;
  - the sub-label in 11px, muted.
- **Unselected:** card surface, 1px card border. The outline is muted on card surface.
- **Selected:** accent tint background, 1.5px accent border. The outline is in label colour on accent tint.
- **Accessibility:** a radiogroup, `aria-label` "Page size".

## 4. Mobile

**The Page block moves to the top of the existing Arrangement sheet:**
- "Page" label;
- the full-width Paged / Pageless control;
- the tiles;
- More sizes;
- a 1px divider, then the existing sheet content.

There is no Page card on the page itself.

## 5. Rendering

Build one `ManifestoSheet` with `mode` and `size` props. It's used on screen and for export.

### Paged: A4 / A3, Letter, Tabloid

- **Layout:** the existing desktop poster layout, at the logical page size from section 2.
- **Fitting to the screen:** render at the logical size and scale it with a CSS transform to fit the available width.
  - **Desktop:** never above 1. Keep it at its current on-screen size where it fits.
  - **Mobile:** fit the width, about 0.33 on a 360px phone.
  - The scaled box keeps its scaled height, so nothing overlaps.
- **Spacing per size**, taken from the board:

  | Size | Page padding | Gap above chapters / between chapters | Words to keep top padding |
  |---|---|---|---|
  | `a` | 58 76 44 | 26 / 18 (current) | 30 |
  | `letter` | 50 76 38 | 18 / 10 | 18 |
  | `tabloid` | 70 76 54 | 40 / 34 | 30 |

- **Fixed height:** the footer stays pinned to the bottom (`margin-top: auto`, as now).
- **Too much content:** if the content is taller than the page, scale the content block inside the page down to fit, but not below **0.8**. If it still doesn't fit, clip nothing. Instead show a 12px line in the label colour under the size tiles: "Doesn't fit on one page. Hide sections in Arrangement, or use Pageless." Export stays enabled.

### Paged: Phone wallpaper

A separate layout at 540 × 1170 logical:
- **Container:** paper background with grain, an inner 1px light-accent frame inset 14px, padding **380px 46px 40px**. The top third is left empty for the lock-screen clock.
- **Contents, in order:**
  1. the "My manifesto" eyebrow rule;
  2. the name (serif italic 34px);
  3. the statement (serif italic 16px, centred);
  4. the double rules with values (9px caps, wrapping, centred);
  5. a 2-column grid of life areas, gap **20px 24px**:
     - each tile is that area's first vision board image as a mounted square print at **176px**, with the small existing rotation;
     - under it, the roman numeral (serif italic 13px, accent) and the area name (serif 22px).
  6. the footer mark pinned to the bottom.
- **Not included:** dreams, "What it looks like", notes, quotes and the story.
- **More than 4 areas:** use 3 columns at 132px. More than 9: show the first 9.

### Pageless

- **Layout:** the sheet fills the available width of the content area and grows with its content. There's no fixed height, and the footer follows the content with a **40px** gap.
- **Desktop:** the desktop poster layout. The statement's max width goes from 720 to **820px**, because the sheet is wider.
- **Below `sm`:** the existing mobile reflow layout, unchanged.

## 6. Mobile paged: viewer

- **Zoom button:** a **34px** circle at the page's bottom-right, inset 10px: card surface, 1px card border, a small shadow, and a zoom-in icon at 16px. `aria-label` "View full screen".
- **Opening:** tapping the page or the zoom button opens a full-screen viewer:
  - background in heading colour;
  - the page starts fitted to the screen;
  - pinch to zoom (1× to 4×), drag to pan, double-tap to toggle between fit and 100%.
- **Close:** a **38px** circle at the top-left, inset 14px: heading colour at 70%, a white ×. Escape and back gesture also close it.
- **Zoom level:** while pinching, a pill at the bottom centre shows the zoom level ("90%"): 12px 600, white, on heading colour at 70%, padding 7px 14px. It fades out 1s after the gesture ends.

## 7. Export

- **What's exported:** Export (desktop) and Save as image (mobile) render `ManifestoSheet` in the current `mode` and `size` at the export pixel size from section 2, using the existing export pipeline.
- **Pageless output:** a single PNG, at 2× the logical width it's rendered at (desktop width on larger screens, 360 below `sm`).
- **File name:** `{FirstName}-manifesto-{size}.png`, or `-pageless.png`, or `-wallpaper.png` for phone.
- **Phone extra:** on phone exports, if the share sheet is available, offer it directly, so the user can save the image to Photos and set it as a wallpaper.

## 8. Arrangement interplay

- **Hidden sections:** sections hidden in Arrangement are hidden in every mode.
- **Phone wallpaper:** always uses only its own fixed parts, whatever Arrangement and the story-on-print setting say.
- **Story on print:** follows its existing setting in the other modes.

## Don't change

- The print styling.
- The Edit view.
- Arrangement's existing controls (beyond adding the Page block on mobile).
- The story on print.
