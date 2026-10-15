# Manifest › Story: clean editor top, floating editor tools

This updates the Story page as it is now, after the editor-tools and prompt-labels change. Change only what's listed here.

**Reference:** `docs/design/app/ManifestoStory.dc.html` and `ManifestoStory.png`, which show rows A and D (desktop and mobile). Port px from the HTML source and ignore the board captions.

Use existing tokens by role only.

## 1. Nothing above the first line of the story

Inside the writing card (A and D, desktop and mobile), remove:
- the header row: the "My life vision" label, the rule after it, and the Raise the ceiling pill and mic that sit there;
- the fixed line "Don't hold back. Write the biggest version of your life you can imagine."

The card's content now starts directly with the first prompt label, or the first paragraph if there's no label. Card padding is unchanged.

This doesn't change state B's story card, which keeps its "My life vision · v{n}" row.

## 2. The fixed line moves into the header card

"Your story" currently has the subline "Your whole life vision, written as if it's already true. Aim for ten minutes of listening." Replace that subline with "**Don't hold back. Write the biggest version of your life you can imagine.**" Style it in italic serif, label colour:
- **Desktop:** 16px, line-height 1.45, in the same slot.
- **Mobile:** 14px. It goes on its own line under the title row and above the compact meter. Pull it 4px closer to the title row (`margin-top: -4px` inside the card's 12px gap).

The C (guidelines) header card keeps its own subline.

## 3. Floating editor tools

The Raise the ceiling button and the mic move into a small floating toolbar that is **visible at every scroll position**, from the top of the page to the bottom.

- **Container:** card surface, a 1px card-border border, fully rounded, padding **5px**, shadow `0 8px 22px` at about 14% of the heading colour. It holds the two buttons with an **8px** gap.
- **Raise the ceiling:** use the app's primary (Mist) button style, not the accent tint. The accent isn't used for buttons.
  - Size: **34px** high (32px on mobile), padding 0 12px.
  - Content: the sparkle icon at 13px, then "Raise the ceiling" in 12px, 600.
- **Mic:** outline circle, **34px** (32px on mobile), mic icon 15px, `aria-label` "Talk it out". It shows the existing recording state while dictating.
- **Desktop position:** `position: fixed`, **24px** from the bottom of the viewport. Its right edge lines up with the writing card's right edge: measure the card and update on resize. It stays on screen however far you scroll, including when the writing card is out of view.
- **Mobile position:** `position: fixed`, bottom **16px**, right **14px**. It's visible at every scroll position, including while typing.
  - **While the on-screen keyboard is open,** move it so it sits **8px above the keyboard**:
    - in the browser, position it from `window.visualViewport` (listen to its `resize` and `scroll` events);
    - in the Capacitor app, use the Keyboard plugin's show/hide events and keyboard height.
    - When the keyboard closes, it returns to bottom 16px.
  - The only time it hides is while the All prompts or Raise the ceiling sheet is open, because the sheet covers that area.
- **Clearance:** it floats over content and never shifts layout. Give the page enough bottom padding (at least **72px**) that the end of the story and the cards below aren't covered when you scroll to the bottom.
- **Behaviour is unchanged:**
  - Raise the ceiling opens state D (the side card on desktop, the sheet on mobile).
  - The mic dictates at the cursor.

## Don't change

- Prompt labels.
- The Prompts and Go bigger cards.
- The prompt card on mobile.
- "Prepare for narration".
- State B.
- The guidelines.
