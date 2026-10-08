# Audio player strip restyle

## Scope

Restyle the **existing floating audio player strip** (the bar showing artwork, rewind / play / forward, the title, the progress bar with times, and close).

- This is a **visual change only**:
  - Keep the component's position, width and behaviour.
  - Keep where it appears, its playback logic and its responsive behaviour.
- Don't touch anything else:
  - the app header, the sidebar, the footer bar;
  - any page content;
  - other components.

## Reference

`docs/design/app/PlayerStrip.dc.html` and `PlayerStrip.png`. Use **option C** (the first screen, labelled "C · Recommended") and the **"No artwork (C)"** row at the bottom.

- **Ignore:** options A and B, the board titles, and everything outside the strip.
- **Port the strip's structure from the HTML source:** the same elements, sizes, radii, padding, gaps and font sizes.
- **Don't take colours from the file.** Use the tokens below.

## Colours

Add **one new token**, `player-surface-start`: a deep, darker shade of the existing play-button blue (the mist blue used on play circles). It should be dark enough that ivory text on it passes WCAG AA.

Use existing tokens for everything else:

- **Surface:** a horizontal linear gradient, 90deg, from `player-surface-start` to the existing dark navy token used by the app header.
- **Text, icons, outlines:** the existing ivory or light-on-dark text token.
  - Use it at full strength for the title.
  - At 60% opacity for times, the subtitle and close.
  - At 55% for the outline-button borders.
  - At 18% for the progress track.
- **Progress fill and thumb:** the existing accent (gold) token.
- **Play button:** the app's existing primary play-circle style (the same mist-blue circle as every other play button). No new styling.

## Strip

- **Shape:** height **76px**, `border-radius: 9999px` (fully rounded ends), padding **10px 24px 10px 10px**, a row with items centred and a **16px** gap.
- **Shadow:**
  - an outer shadow `0 10px 30px`, using the dark navy token at 25%;
  - plus an inset top highlight `inset 0 1px 0` in white at 14%.
- **Order, left to right:** artwork, transport controls, centre column (flex 1, `min-width: 0`), close.

## Artwork

**With artwork:**
- **56×56** and **fully circular** (`border-radius: 9999px`), with `object-fit: cover` and overflow hidden.

**Without artwork** (mixes, voice samples, anything with no image):
- a **56px** circle, filled with the ivory token at 10% and a 1px border in ivory at 18%;
- centred inside it, a **24px** waveform icon from the app's existing icon set (e.g. an audio-lines / waveform icon), stroke **1.8**, in the gold accent.

## Transport controls

- A row with an **8px** gap: rewind, play/pause, forward.
- **Rewind and forward:**
  - **36px** circles with a 1.5px border in ivory at 55% and a transparent fill;
  - **14px** icons in ivory.
- **Play/pause:** a **44px** circle in the existing primary play-circle style, with the pause icon while playing.

## Centre column

The column has a **8px** gap.

**Title row** (centred, **10px** gap, baseline-aligned):
- the title in the **serif** font at **19px**, ivory, `nowrap`, with an ellipsis if it overflows;
- an optional subtitle in **sans 12px**, ivory at 60%: "Your mix" for Build your own mixes, "Voice sample" for voice previews, and nothing for soundscapes or meditations.

**Progress row** (items centred, **12px** gap):
- **The elapsed time:** sans **12px**, ivory at 60%, `font-variant-numeric: tabular-nums`.
- **The track:** flex 1, **4px** high, radius 2px, ivory at 18%.
  - The fill is the gold accent.
  - The thumb is a **14px** solid gold circle.
  - Keep the existing seek behaviour.
- **The total time:** same style as the elapsed time.

## Close

- The existing close action, as an **18px** × icon in ivory at 60%, with **4px** left padding.
- It reaches full ivory on hover.

## States

- **Hover on the outline buttons:** the border goes to full ivory.
- **Focus-visible:** the existing focus ring, in the accent.

All controls keep their existing aria labels.
