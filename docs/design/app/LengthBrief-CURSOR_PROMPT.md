# Create flow: move Length into the brief

## Scope

**This is the only change:** move the **Length** control out of the Create footer and into the brief area on every step, and restyle it as a chip. Keep the existing length options, the program / per-session length logic and the stored value exactly as they are. Only where the control lives and how it looks change.

Do not touch:
- the app header, the sidebar, the stepper;
- any other part of the steps;
- other pages;
- colour tokens.

## Reference

Port the chip, the popover and their placement from `docs/design/app/LengthBrief.dc.html` and `LengthBrief.png`. The file has three screens: Start (popover open), Shape and Sound. Ignore the board titles and everything that isn't the length chip, its popover, or the footer change.

## Colours

Use the existing tokens by role:
- **Chip:** card surface, a 1px light-accent border, heading text, the label/accent colour for the clock icon, and muted text for ▾.
- **Popover:** card surface, card border, accent tint for the selected option, label colour for ✓.
- **Open state:** accent border plus a 3px accent ring at 25%.

## Length chip (one component)

**Shape:**
- `inline-flex`, items centred, **6px** gap, padding **0 10px**, pill radius, `nowrap`.
- **32px** high, sans **13px 600**.
- Compact variant: **26px** high, **12px**.

**Contents:**
- a **14px** clock icon from the existing icon set;
- the value;
- ▾ at **10px**, muted.

**Values:**
- A single meditation shows its length, e.g. "5 min".
- With a Program attached, use the values the footer control currently shows: "Program · ≈45 min" (defaults), "Mixed · ≈38 min" (per-session overrides), or the applied-to-all length.

**Interaction:**
- Click opens the popover. The chip shows the open state while the popover is open.
- `aria-haspopup="listbox"` and `aria-expanded`.

## Popover

**Container:**
- Anchored below the chip, **8px** gap, right-aligned to the chip, **200px** wide.
- Card surface, 1px border, radius **12px**, padding **6px**, a soft drop shadow.
- Column layout with a **2px** gap.

**Options:**
- The **existing** length options, unchanged.
- Each option: padding **8px 12px**, radius **8px**, sans **14px**.
- The selected option has the tint background, weight 600, and ✓ on the right.

**Programs:**
- With a Program attached, the popover contains whatever the footer control's menu currently offers (apply-to-all, reset to program).
- On **Shape**, choosing the per-session option scrolls to and highlights the per-session lengths in the program card, as it does now.

**Behaviour:**
- Selecting an option closes the popover. Esc or a click outside closes it without changing anything.
- Use full listbox keyboard behaviour.

## Placement

- **Start:** in the composer's bottom row, immediately left of the Speak and Send buttons, with an **8px** gap and an extra **4px** right margin. Use the 32px chip.
- **Shape:** in the "You're making" card, a row under the brief text, with a **6px** gap and wrapping. Use the 32px chip. In the narrower layouts where the brief renders as a header or row, the chip goes inside that brief as well.
- **Sound:** the length chip in the "You're making" summary strip becomes this component. Use the **compact** variant.
- **Mobile:** the same placements, with the 32px chip on Start and Shape and the compact chip on Sound.

## Footer

- **Remove Length** (its label and its select) from the Create footer on every step, desktop and mobile.
- The footer keeps Back on the left and the step's actions on the right, with the same heights, paddings and positions as now.
- If the footer uses a three-column grid, keep the empty middle column so the actions don't move.
