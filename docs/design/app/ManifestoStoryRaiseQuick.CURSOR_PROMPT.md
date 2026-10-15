# Manifest › Story: quick accept / reject on every Raise the ceiling suggestion

This updates the inline suggestion mode you've just built. Change only the inline actions on desktop. Everything else stays as built.

**Reference:** `docs/design/app/ManifestoStory.dc.html` and `ManifestoStory.png`, row D (desktop). Port px from the HTML source.

Use existing tokens by role only.

## 1. Every finding gets ✓ and ✕

Straight after each suggestion (`ins`), on every finding and not only the active one, add a small inline group:
- **Group:** `display: inline-flex`, 4px left margin, 3px gap. No wrapping inside the group, and `vertical-align` adjusted so the buttons sit on the text line.
- **✓:** a **20px** circle in the app's primary (Mist) button style, with the check icon at 11px. `aria-label` "Use". It does the same as Use.
- **✕:** a **20px** outline circle (card surface, 1px card-border border, muted ×). `aria-label` "Keep mine". It does the same as Keep mine.

## 2. The active finding's pill becomes compact

Replace the current active pill (Use / Another / Keep mine) with the same ✓ and ✕ group as above, plus "**Another**":
- sparkle icon at 10px, then the label in 11px, 600;
- outline, **20px** high, padding 0 8px.

The active style on the suggestion is unchanged: a 2px accent bottom edge.

## 3. Behaviour

- **Using ✓ or ✕ on any finding** resolves it directly, without making it active first.
- **If it was the active finding,** the next unresolved finding becomes active.

## Don't change

- Mobile: no inline buttons; tapping a finding opens the sheet.
- The `del`/`ins` styling.
- The side card, Use all and Done.
