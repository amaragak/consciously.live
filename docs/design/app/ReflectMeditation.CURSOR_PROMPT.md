# Reflect on a meditation (Library cards + player strip → journal entry)

## Scope

Add a **Reflect** action. It opens a new journal entry linked to a meditation, with that meditation shown at the top of the entry.

**Where it appears:**
1. **Library meditation cards:** My creations, Community, and any per-session cards in Programs.
2. **The audio player strip:** only while a **meditation** is playing (your own, a program session or a community one), never for soundscapes, voice samples or mixes.
3. **The journal entry editor:** the attached meditation card, prompts and an entry-list marker.

**Don't touch:**
- anything else on Library, the player strip or the journal editor;
- other pages;
- colour tokens.

## Reference

`docs/design/app/ReflectMeditation.dc.html` and `ReflectMeditation.png`:
- **A:** Library, plus the player strip.
- **B:** the new journal entry, with the meditation attached.

Port only the new elements, with the structure and px from the HTML source. Ignore the board titles and the sample data.

## Colours and icons

**Colours:** use the existing tokens by role:
- card surface, card border, heading, body and muted text, label/accent text;
- the accent tint and light-accent border (the attached card);
- the primary play-circle style;
- the outline button style;
- the player strip's existing light-on-dark text and outline treatment.

**Icons:** use the app's standard icons: a pen/edit icon for Reflect, a journal/book icon for the reflections link, and the standard play/pause, close (×) and chevrons at their standard sizes.

## Data

**Journal entry:** add an optional link to a meditation, `meditationId` (nullable), plus whatever source type the app needs to resolve it (own / program session / community).

**Reflections count:** add a query or selector for the number of entries linked to a given meditation.

**Creating via Reflect**
1. Create a **new** entry with `meditationId` set.
2. Give it the title **"Reflection: {meditation title}"**, which stays editable.
3. Navigate to the journal editor for that entry.
4. Create the entry only on first keystroke, or save an empty one, whichever matches how New entry works today.

## 1. Library cards

**Reflect button**
- In the card's right-hand column, under the existing heart and ⋯ row.
- An outline pill, **34px** high, padding **0 12px**, **6px** gap, 13px, 600: the pen icon (in the label/accent colour), then "Reflect".
- **Mobile:** icon-only (34px circle), with `aria-label="Reflect on this meditation"`.

**Reflections link**
- Only when the count is 1 or more.
- At the end of the card's meta row, after the stars, with an **8px** left margin.
- The book icon at 12px, then "{n} reflection" or "{n} reflections", in 12px, 600, label colour.
- **Click:** opens the journal filtered to entries linked to this meditation. If n = 1, it opens that entry directly.

**Click behaviour:** both of these are separate click targets, so they don't trigger the card's own click.

## 2. Player strip

- **Only** when the current item is a meditation, add a **"Reflect"** pill between the progress column and ×.
  - **Size:** **36px** high, padding **0 14px**, **6px** gap, 13px, 600.
  - **Look:** the pen icon, then "Reflect", in the strip's light text, with a 1.5px light outline at about 55%.
  - **Mobile:** icon-only.
- **Click:** it does the same as the Library Reflect, for the meditation that's playing. Playback **keeps going**, because the strip persists across navigation.
- **While on that meditation's linked entry:** show the pill in an active state, with an accent-ish border and a faint fill, matching the design.

## 3. Journal editor: attached meditation card

**When it shows:** the entry has a `meditationId`. It goes directly under the title and date/mood row, above the toolbar.

**Container:** padding **12px 14px**, radius **14px**, accent tint, 1px light-accent border, items centred, **14px** gap.

**Contents, left to right**
1. **Cover:** the meditation's cover at **64×64**, radius **10px**.
2. **Middle column:** flex 1, `min-width: 0`, **4px** gap.
   - "Reflecting on" in 10px, uppercase, letter-spacing 1.4px, 600, label colour;
   - the meditation title in serif **17px**, one line with an ellipsis;
   - a row with a **10px** gap:
     - the voice avatar (16px), then "{voice} · {type}" in 12px muted;
     - a mini progress bar, max **320px**: the elapsed time, a 4px track with accent fill, and the duration.
3. **Right group** (**8px** gap):
   - **Play/pause:** a **40px** circle in the primary play-circle style.
   - **"Open":** an outline pill, **34px** high. It goes to the meditation's existing detail view.
   - **×:** muted, with `aria-label="Unlink meditation"`. It removes the link and shows the app's existing toast pattern with **Undo**.

**Behaviour: one player, not two**
- The card **drives the global player**. Play loads this meditation into the strip (resuming its position if it was already loaded) and plays it. Pause pauses the strip.
- The card's progress and play state **mirror the strip** while this meditation is the current item. When it isn't, the card shows 0:00 / duration and a play icon.

**Mobile**
- The same card, with the cover at **48px** and the progress row wrapping under the title.
- Open moves into a ⋯ menu along with Unlink.

## 4. Journal editor: prompts

**When they show:** for an entry with a `meditationId` and an empty body.
- The body placeholder reads "**What came up for you?**".
- Under it, a row of prompt chips: **32px**, pill, 1px border, card surface, 13px, prefixed with ✦ in the label colour, **8px** gap, wrapping:
  - "What did you notice in your body?"
  - "Did anything shift?"
  - "What will you take into today?"
- **Click:** clicking a chip inserts that prompt as a short line at the cursor, as its own paragraph, and puts the cursor on the next line. The chips hide as soon as the body has content.

## 5. Journal entries list

For entries with a `meditationId`, add a marker to the right of the card footer: the pen icon at 11px, then "Reflection", in 11px, label colour.
