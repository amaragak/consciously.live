# Manifest › Story: Raise the ceiling level dial (Ambitious · Audacious · Delusional)

Add a three-step dial that sets how far Raise the ceiling pushes its suggestions. All three levels are generated in one call, so moving the dial swaps text instantly. This builds on the current Raise the ceiling setup: the inline suggestion mode, the side card, the mobile sheet and the check-before-preparing dialog. Change only what's listed here.

**Reference:** `docs/design/app/RaiseDial.dc.html` and `RaiseDial.png`. Port px from the HTML source and ignore the board captions and sample text.

**Styling:** existing tokens by role only.

---

## 1. Data and model call

- **Response shape:** the Raise the ceiling analysis returns, per finding:
  ```
  { range, type, original, suggestions: { ambitious, audacious, delusional } }
  ```
- **Model instructions:** for each finding, write three rewrites of the same idea at rising scale:
  - **ambitious:** a clear step up that is still recognisably the user's life;
  - **audacious:** far beyond what's reasonable;
  - **delusional:** the biggest version imaginable.
  All three keep the same subject, the same specifics and the same person (first or third) as the text.
- **Which lines are flagged doesn't depend on the level.** The dial changes only the suggestion text, so findings never appear or disappear as it moves.
- **Streaming:** stream findings in as they complete, if the current call doesn't already.
- **One call covers every use:** the same call and response serve the Raise the ceiling button and the check before preparing.
- **"Another":** regenerates only that finding, at the current level only. It replaces that one level's text.

## 2. Level setting

- **Values:** `'ambitious' | 'audacious' | 'delusional'`. The default is `'ambitious'`.
- **Saving:** save it per user (the user's settings), not per draft. The last level picked is used next time.
- **Where it applies:** changing the level anywhere (side card, sheet or dialog) changes it everywhere, straight away.
- **On change:**
  - every unresolved finding shows its suggestion for the new level, in the inline `ins` decoration, the side card or sheet rows, and the dialog rows;
  - findings already used or kept are not affected;
  - there's no network call and no loading state.
- **Applying a suggestion:** **Use** and **Use all** apply the suggestions for the level showing at that moment.

## 3. Dial component

`RaiseLevelDial`: a segmented control with three equal segments.

- **Track:** progress-track background, padding 3px, radius **15px**, a 2px gap between segments.
- **Each segment:** `flex: 1`, a column, items centred, a 4px gap, padding **8px 4px 7px**, radius **12px**.
  - **Contents:** the sun mark at **36px** (32px on mobile), then the label in 12px, 600, no wrapping.
  - **Selected:** card surface, a small shadow (`0 1px 4px` at about 16% of the heading colour), label in heading colour.
  - **Levels above the selected one:** label in body colour, sun at full opacity.
  - **Levels below the selected one:** label muted, sun at **45%** opacity.
- **Accessibility:** use a radiogroup, with `aria-label` "How far to push". The arrow keys move between levels.
- **Sun mark per level:** an inline SVG with a 64 viewBox.
  - **Disc:** a radial gradient from light-accent (highlight at about 38% / 34%) to accent.
  - **Rays:** slim tapered triangles in accent, with a 0.6px round-joined stroke to soften the tips. They start 2.2 out from the disc edge and are evenly spaced, starting straight up.
  - **Face:** fine-line, in label colour (the dark gold), never ink, with 1.4 stroke width and round caps. The face is scaled to the disc. Faces get happier at each step so that the top option feels fun to pick, not reckless.

  | Level | Disc radius | Main rays (length, half-width) | Short rays in between (length, half-width) | Face | Extra |
  |---|---|---|---|---|---|
  | Ambitious | 14 | 8 (5.5, 1.7) | none | dot eyes, gentle smile arc | none |
  | Audacious | 15 | 8 (8.5, 1.7) | 8 (3.2, 1.2) | closed happy-arc eyes, open grin (filled D) | none |
  | Delusional | 16 | 12 (10.5, 1.5) | 12 (5.5, 1.2) | small four-point star eyes, wider open grin with a light-accent tongue | soft glow: accent at about 32% from 35% radius, fading to 0 at radius 31 |

  Copy the SVG paths exactly from the HTML source. Build it as one `SunFace` component with a `level` prop. Give each gradient a unique id per instance.
- **Motion:** when a level is selected, its sun scales from 0.85 to 1 over 200ms ease-out. Skip it with `prefers-reduced-motion`.

## 4. Ambition read: add an Aim marker

Extend the existing ambition read component, keeping its title and the "Ambition" label.

- **You:** the current marker becomes a hollow ring: **16px**, card surface fill, 2px border in label colour. It sits at the draft's current score, as now. Under it, "You" in 11px muted.
- **Aim:** a filled **18px** accent-colour dot with a 3px ring of accent at about 25%. Under it, "Aim" in 11px, 600, label colour.
  - **Position by level:** Ambitious **48%**, Audacious **68%**, Delusional **90%** of the bar.
  - When the level changes, Aim slides to its new position over 250ms.
- **Between the markers:** a dashed line from You to Aim, 2px tall, vertically centred on the bar. Dashes are label colour, 4px on and 3px off.
- **Label row:** a 14px-high row under the bar, with each label centred under its marker.

## 5. Placement

- **Side card (desktop):** the dial sits directly under the header row ("Raise the ceiling" and ×), above the ambition read, with the card's existing 14px gap.
- **Sheet (mobile):** in the same position, full width, with the sun at 26px.
- **Check-before-preparing dialog:**
  - **Desktop:** the dial sits under the header block, above the ambition read.
  - **Mobile sheet:** show the dial, but keep the ambition read hidden as now.
- **The editor's inline decorations** have no dial. They just follow the level.

## Don't change

- The finding types, the "checked" tracking and the ✓ / ✕ / Another behaviour, apart from the level-aware text above.
- The floating editor tools and the Raise the ceiling button.
- Prepare for narration, narration and print.
