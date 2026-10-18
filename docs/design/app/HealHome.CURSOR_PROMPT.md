# Heal home: fix the mobile layout and add a proper empty state

On mobile (below `sm`) the Heal home has four problems:
- the desktop layout squeezed down: a large intro card;
- a check-in card whose row layout wraps the title one word per line;
- a second, duplicate "Start a check-in" button under the card;
- a 30px section title with "+ Add something" breaking over two lines, and the empty-state text sitting directly on the page background.

Fix the mobile layout and add an empty state for all sizes. Change only what's listed here.

**Reference:** `docs/design/app/HealHome.dc.html` and `HealHome.png`, the **Mobile** phone frame. Port px from the HTML source, and ignore the board captions and sample content.

**Styling:** existing tokens by role only, plus the Heal tokens (`heal-accent`, `heal-tint`, `heal-border`).

---

## 1. Mobile intro card (below `sm`)

Use the compact version:
- **Container:** card surface, padding **16px**, a column with a **6px** gap.
- **Title:** "For the things you can't seem to put down", serif **19px**, line-height 1.25.
- **Body:** **13px** body colour, line-height 1.5: "Long-term things that are hard to get past: grief, regret, a relationship that ended. Day-to-day thoughts belong in **Journal**." Journal is a link (600, `heal-accent`).

`sm` and up keep the current desktop card.

## 2. Mobile check-in card (below `sm`)

- **Layout:** a **column**, not a row. `heal-tint` background, 1px `heal-border`, radius 16px, padding **14px 16px**, a **10px** gap.
- **Contents:**
  - the title "A few minutes for what you're carrying" in serif **18px**;
  - no icon and no subline on mobile;
  - the primary "**Start a check-in**", **full width**, 40px.
- **Remove the duplicate button** that currently renders under the card. There's one button only, inside the card, at every size.
- **Hide the check-in card entirely when the user has no active items.** It currently shows with disabled buttons.

`sm` and up keep the row layout (icon, text, button on the right).

## 3. Section headers in Heal

"What you're carrying" and "Laid to rest" use the small section label used elsewhere in Heal, at every size, not a 30px serif title:
- **Label:** 12px caps, letter-spacing 1.6px, 600, `heal-accent`.
- **Right side:** "+ Add" on mobile, "+ Add something" from `sm` up (13px, 600, `heal-accent`, plus icon). It sits on one line, right-aligned in the header row, with `white-space: nowrap`.

## 4. Empty state (no items yet)

**Replace** the plain "Nothing here yet…" text with an empty-state **card**. No text sits directly on the page background.

**Card:** card surface, 1px card border, radius 16px, padding **20px** (**16px** on mobile), a column with a **12px** gap.
- **Icon:** a heart in a **40px** circle on `heal-tint`, `heal-accent`.
- **Title:** "Start with one thing" in serif **20px** (18px on mobile).
- **Body:** 14px body colour (13px on mobile): "Something you keep coming back to: someone you've lost, something you regret, a relationship that ended. You can add more later."
- **Example chips:** a wrapping row with an 8px gap, using the outline chip style. Each opens the Add sheet with that type selected:
  - "Someone I've lost" → grief
  - "A relationship that ended" → heartbreak
  - "Something I regret" → regret
  - "A falling-out" → resentment
- **Button:** the primary "**Add something you're carrying**", full width on mobile and auto width from `sm` up. It opens the Add sheet with no type selected.

**When empty, hide:**
- the check-in card (section 2);
- the "Laid to rest" section.

The intro card and the support line card stay.

## 5. Mobile spacing

- **Page:** horizontal padding as on other mobile pages.
- **Gaps:** 12px between cards, and 18px before each section label.
- **Support line card:** sits last, above the bottom navigation, with no content hidden behind the nav. Add bottom padding equal to the nav's height plus 16px.

## Don't change

- The desktop layout, except for one check-in button, the section headers and the empty state.
- Item cards, the item page, check-in, letters and practices.
