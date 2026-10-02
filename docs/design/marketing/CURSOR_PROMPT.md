# Marketing site: mobile menu drawer

## Goal

Build the mobile menu for the marketing site (Next.js app), below the existing mobile breakpoint (`md`). The header's menu button opens a **drawer that slides in from the left**. A strip of the dimmed page stays visible on the right, so it reads clearly as a layer on top.

Match `docs/design/marketing/MenuMobile.dc.html` and `MenuMobile-360.png` exactly.
- `MenuMobile.dc.html` is plain HTML with inline styles. **Read its source and port its structure**: the same elements, nesting, borders, padding, gaps and font sizes.
- Ignore its `<helmet>`, `<x-dc>` and script wrappers. The page content behind the drawer in that file is only there for context.
- **Don't add anything the design doesn't have.** No extra containers, cards, icons, borders or backgrounds. Likewise, don't drop anything it has.

## Colours

Match the design, using the existing token for each role:
- the drawer uses the page background;
- hairlines, accent, primary button, and heading, body and muted text use the same tokens as the rest of the marketing site.

## Don't touch

Desktop (`md` and up), the footer, page content, colour tokens.

## Drawer spec (below `md`)

**Overlay**
- A fixed, full-viewport layer above everything, including the header.
- **Scrim:** covers the whole viewport with a dark translucent overlay (about 60% opacity). Tapping it closes the menu.

**Panel**
- Fixed to the left edge, full height, **width `min(296px, 82vw)`**.
- Page background, a 1px hairline on the right edge, and a soft shadow to the right.
- A column layout. It scrolls internally if it's taller than the viewport; the page behind doesn't scroll.

**Panel top bar**
- **Height 60px**, padding 0 8px 0 20px, with a 1px hairline at the bottom. It mirrors the site header.
- Left: the sun at 22px, an 8px gap, then "consciously" in serif 22px.
- Right: a **44×44** close button with a 22px × icon, `aria-label="Close menu"`.

**Nav (`<nav aria-label="Main">`)**
- Padding **16px 20px 24px**, a column that grows to fill the panel.
- **Tool rows:** Meditate, Journal, Manifest, Focus and Chat, in that order. Each row is a link:
  - padding 10px 0, **min-height 52px**, a column with a **2px gap**;
  - the name in **serif 22px**, heading colour, with **no "consciously" prefix**;
  - one line under it in sans **13px**, muted:
    - Meditate: "Meditations made from your life"
    - Journal: "Write or speak, see the patterns"
    - Manifest: "Vision board, manifesto, goals"
    - Focus: "A timer for your goals"
    - Chat: "A coach that acts"
  - **Current page:** the name is **serif italic, in the accent colour**, and the link has `aria-current="page"`. No dot or other marker.
- **Divider:** a 1px hairline with margin 12px 0 8px.
- **Secondary rows:** Listen, Read and Connect. Each is a link with min-height **44px**, sans **17px**, body colour. The current page gets `aria-current="page"` and accent text.
- **Actions, pinned to the bottom** (`margin-top: auto`), a column with a **6px** gap:
  - "Start free": **52px** high, full width, pill, sans **16px 600**, in the primary button style;
  - "Sign in": a text link, **44px** high, centred, sans **15px**, body colour.
- All links point where the desktop nav's links point.

**Header button**
- Below `md`, the header's menu button (44×44, two-line icon) opens the drawer.
- It gets `aria-label="Open menu"`, `aria-expanded` and `aria-controls`.
- Keep it where it is now.

## Behaviour

- **Open:** the panel slides in from the left (`translateX(-100%)` to `0`) over **220ms**, ease-out, while the scrim fades in.
- **Close:** the reverse, over 180ms.
- **With `prefers-reduced-motion`:** no slide, just an instant show/hide (or a fade only).
- **Close on:** the × button, a tap on the scrim, Escape, choosing any link, and resizing to `md` or above.
- **While open:**
  - lock body scroll;
  - make the rest of the page inert (`inert` or `aria-hidden`);
  - move focus to the close button;
  - trap Tab within the panel.
- **On close,** return focus to the menu button.
- The drawer is a `role="dialog"` with `aria-modal="true"` and `aria-label="Menu"`.

## Done when

- At 360px it matches `MenuMobile-360.png`: a 296px panel, with the dimmed page visible to the right.
- At 320px the panel is 82vw, nothing is clipped, and the Start free / Sign in buttons are visible without scrolling on a typical phone height (≥ 640px). On shorter screens the panel scrolls.
- All the close paths work, focus is managed, scroll is locked, and reduced motion is respected.
- Desktop is unchanged.
- Typecheck, lint and build pass. List the files changed.
