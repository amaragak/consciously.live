# Length chip popover: reuse the program session control

## Scope

This changes **only the length chip's popover when a Program is attached**.

**Shared component:** the chip is used on every Create step (Start, Shape, Sound), so a user who skips Shape can still choose the program mode, the sessions and their lengths.

**Unchanged:**
- the chip's position and base styling, and its popover for single meditations (no Program);
- the Shape step's Format · Program card;
- the header, the sidebar, the footer and other pages;
- colour tokens.

## The rule: one control, two places

The Shape step's **Format · Program** card already has the program session control:
- the **One meditation | One per session** segmented control (One meditation on the left);
- "Sessions · k of n · ≈ total" with **All / None**;
- one row per session: a checkbox, "{i}. {name}", and a length select.

1. **Extract it into a shared component**, if it isn't one already, and render that same component inside the chip popover.
2. **Same order, labels, checkboxes, All/None and length selects** as on Shape.
3. **Same state:** both places read and write the same program state, so a change in one shows in the other immediately.
4. **No popover-specific copy of the logic.**

## Reference

`docs/design/app/ProgramLengthChip.dc.html` and `ProgramLengthChip.png` show it on the Start step:
- **Screen A:** One per session.
- **Screen B:** One meditation.

The control's styling comes from the existing Shape component, not the mock-up. From the mock-up, port only the popover container, the foot row and the chip label. Ignore the sample session names.

## Popover container

- Anchored below the chip, right-aligned, with an **8px** gap.
- **320px** wide (on mobile, at most the viewport width minus 32px), radius **14px**, padding **10px**, a column with a **6px** gap.
- Card surface, card border, soft shadow.
- Contents: the shared program session control, then the foot row.

## Foot row

- A 1px top border in the card border colour, padding **10px 4px 2px**, sans **13px**, space-between.
- **Left (muted):** "Total ≈ {sum} min" for One per session, or "1 meditation · {len} min" for One meditation.
- **Right:** "**Reset to program**" (600, label/accent colour). It restores the program's defaults: the program's default mode, all sessions included, and default lengths.

## One meditation

If the Shape component already shows a length choice for One meditation, use it as is. If not, add one to the shared component, so it appears on Shape too:
- a helper line, "All {k} sessions' material in a single meditation" (12px, muted);
- the existing length options as rows: padding **8px 12px**, radius **8px**, 14px; the selected row has the accent tint, weight 600, and ✓.

## Chip label (Program attached)

| State | Label |
|---|---|
| One per session | "{k} sessions · ≈{total} min" (k = sessions included) |
| One meditation | "One meditation · {len} min" |

## Elsewhere

In One meditation mode, hide any per-session Sound UI (the "Set per session" line and the session pills), since there's only one meditation.

## Keyboard

- Esc or a click outside closes the popover.
- Focus returns to the chip.
- Keyboard behaviour inside is whatever the shared component already supports.
