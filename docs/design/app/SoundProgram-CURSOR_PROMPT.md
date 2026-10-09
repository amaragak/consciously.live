# Sound step: per-session settings when a Program is attached

## Scope

This only applies to the **Sound step when a Program is attached**.

**Default behaviour is unchanged:** one voice and sound setup applies to every session. This change adds an optional, low-key way to override voice and sound for individual sessions.

**Don't touch:**
- the Sound step without a Program;
- the brief's existing content;
- the Voice and Sound cards' existing layout and controls;
- the header, the sidebar, the stepper, other steps and pages, colour tokens.

## Reference

Port the structure and px from `docs/design/app/SoundProgram.dc.html` and `SoundProgram.png`.

- **Screen A:** the default.
- **Screen B:** per-session editing, with session 3 selected and overridden.

Port only the new elements: the line and the pills in the brief's Program row, the note in the Sound card, "Same as All" in the Voice card, and the Preview label. Ignore the board titles, the sample data and everything else.

## Colours

Use the existing tokens by role:
- muted text, the label/accent text for links, heading and body text;
- card surface and card border, the light-accent border (the brief's own border);
- accent (selected pill border, override dot), accent tint (the note row);
- the page background (the ring around the dot).

## Data

**Model**
- Keep the current settings object as the program-wide default ("All").
- Add `sessionOverrides: Record<sessionIndex, Partial<SoundSettings>>`, where `SoundSettings` is everything the two cards edit: voice, Guided/Open sits, Pacing, Echo, sound / Build your own mix, Volume and the two switches.
- A session's settings resolve to `{ ...all, ...sessionOverrides[i] }`.

**Editing**
- **With All selected:** edits change `all`. Sessions without an override for that field follow.
- **With a session selected:** edits write only the changed fields into that session's override.
- **Override membership:** a session counts as overridden when its override object is non-empty. If an override field is set back to All's value, remove that field.
- **Generation:** pass each session's resolved settings to generation. If generation currently takes one settings object for the whole program, extend it to accept per-session settings. Tell me what you changed.

**Persistence**
- Persist the overrides with the rest of the Create flow state.
- Clear them if the Program is removed or changed.

## Brief: Program row

**Collapsed (default)**

On the right of the Program row (`margin-left: auto`), one line: sans **13px**, items centred, **8px** gap.
- **No overrides:** "Voice and sound apply to all {n} sessions" (muted) · "**Set per session ›**" (600, label colour).
- **With overrides:** "{k} sessions customised" (muted) · "**Edit**" (600, label colour).
- The "·" separator uses the card border colour.
- Clicking the link expands the row.

**Expanded**

After the program token: a **16px** gap, then a pills group with a 1px light-accent left border, **16px** left padding, a **6px** gap, and its items centred.

- **Pills:**
  - Order: "All sessions", then "1" … "{n}".
  - Each pill: **34px** high, pill radius, padding **0 14px**, min-width **34px**, centred, 1px card border, card surface, sans **13px**, body text.
  - Selected: a **1.5px** accent border, weight 600, heading text.
  - Overridden session: a **9px** accent dot at top **-2px** / right **-2px**, with a 2px page-background border.
- **Right side** (`margin-left: auto`, **13px**, **8px** gap):
  - "{k} sessions differ" (muted), shown only when k > 0;
  - "**Reset all**" (600, label colour), which clears all overrides, shown only when k > 0;
  - "**Done**" (600, label colour), which collapses the row and selects All.
- **Narrow layouts:** the Program row wraps. The pills group goes on its own line with no left border, and scrolls horizontally if needed.

## Cards while a session is selected

**Overridden card**
- When the selected session overrides anything on a card, show a note row directly under that card's head or banner:
  - padding **8px 12px**, radius **10px**, accent-tint fill, sans **13px**, body text, items centred, **8px** gap;
  - an **8px** accent dot, then "Session {i} differs from All", then on the right "**Reset to all**" (600, label colour).
- "Reset to all" removes that card's fields from the session's override.

**Card with no override**
- In the head row, to the left of the existing control, add "Same as All" in **12px**, muted, with a **10px** gap.
- On the Sound card, leave this out when the banner is showing.

**With All selected:** neither of these appears.

## Footer

When a session is selected, the Preview mix button reads "**Preview session {i}**" and previews that session's resolved settings. Otherwise it's unchanged.
