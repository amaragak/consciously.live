# Mobile navigation: bottom tab bar replaces the hamburger menu (below `md` only)

In the logged-in app (the SPA), replace the hamburger and drawer with a bottom tab bar on phone-width screens. **Below `md` only.** At `md` and up (tablet and desktop) nothing changes: the sidebar stays exactly as it is.

**Reference:** `docs/design/app/MobileBottomBar.dc.html` and `MobileBottomBar.png`, frames 1–6. Port px from the HTML source and ignore the board captions and sample content.

**Styling rules:**
- **Colours:** existing tokens by role only (card surface, card border, heading, muted and label text, accent, accent tint, scrim).
- **Chevrons:** use the app's standard chevron at its standard size.
- **Icons:** the same section icons the sidebar uses.

---

## 1. Remove below `md`

- the hamburger button and the slide-out drawer;
- the floating chat button. Chat becomes a tab.

## 2. Bottom tab bar (frame 1)

- **Tabs, in order:** **Meditate · Journal · Manifest · Focus · Chat**.
  - Build them from the same nav config the sidebar uses, so the two never drift.
- **Container:**
  - `position: fixed`, bottom 0, full width, on the card surface with a 1px card-border top edge.
  - Height **58px** plus `env(safe-area-inset-bottom)`, applied as bottom padding.
  - It sits above page content and below sheets, menus and modals.
- **Each tab:**
  - a `<button>` taking equal width, with the icon at 22px over the label in 11px and a **3px** gap;
  - **inactive:** muted colour, 500 weight;
  - **active:** heading colour, 600 weight, and the icon stroke slightly heavier. A **28 × 3px** accent indicator sits at the top edge of the tab, with only the bottom corners rounded;
  - **touch target:** at least 44px.
- **Active tab:** the tab for the section of the current route, including all of that section's child pages.
- **Safe area:** set `viewport-fit=cover` in the HTML entry if it isn't already.

## 3. Tapping a tab

- **Goes to that section's landing page**, the section's root route (e.g. the Meditate landing page, not Library).
- **Tapping the tab you're already in:**
  - on a child page, go to the landing page;
  - on the landing page, scroll to the top.

## 4. Long-pressing a tab (frame 3)

- **Trigger:** hold for **400ms** without moving more than **10px**. Moving more, or releasing early, cancels it and lets a normal tap happen.
- **Haptic:**
  - in the native app, use `@capacitor/haptics` light impact;
  - on the web, use `navigator.vibrate(10)` where supported, and nothing otherwise.
- **Opens a bottom sheet** with that section's tree, from the same nav config as the sidebar.
  - **Sheet:** card surface, top radius **22px**, over a scrim. It sits directly above the tab bar, and the bar stays visible and on top of the scrim.
  - **Top of the sheet:** a 40 × 4px grab handle, then the section name as an eyebrow (11px caps, letter-spacing 1.4px, 600, label colour).
  - **Parent rows:** serif 17px, min-height 48px, with a chevron on the right. If the nav config has a short description, show it under the label in 12px muted.
  - **Child rows:** indented 18px with a 6px dot, at 15px.
  - **The row for the current page** (if it's in this section): accent-tint background, radius 12px, accent dot, 600 weight.
  - **Closing:** tapping a row navigates and closes the sheet. Tapping the scrim or swiping down closes it.
- **Sections with no children** (Focus, Chat): a long-press just acts as a tap.
- **Suppressing the browser's own long-press behaviour:** on the tabs, set `-webkit-touch-callout: none` and `user-select: none`, and call `preventDefault` on `contextmenu`.
- **It's a shortcut only.** Everything in the sheet is also reachable from the section's landing page.

## 5. Header below `md` (frames 1–4)

- **Left:** the sun mark, which links to Home (the dashboard), a 1px divider, then the existing breadcrumb.
- **Right:** search, notifications and the user avatar, in that order. There's no hamburger.
- **Avatar** (frame 4):
  - **Open state:** a 2px accent ring around it.
  - **Tapping it opens a menu card** (radius 16px, card surface, shadow) under the header, right-aligned, over a scrim. Its contents:
    1. the avatar, name and "Signed in", with the existing Pro button on the right;
    2. **Appearance**, with an inline Light / Dark segmented control;
    3. **Settings**;
    4. **Admin** (only for admins);
    5. a divider, then **Sign out**.
  - These are the same items that sit at the bottom of the sidebar. Each row is 46px with a 18px icon.

## 6. Things that sit near the bar

- **Page padding:** add bottom padding equal to the bar's height plus the safe area, so the end of every page scrolls clear of the bar.
- **The mini-player strip** sits **8px above the bar**: bottom = bar height + safe area + 8px.
- **Other fixed-bottom elements** (e.g. the Story page's floating editor tools) offset above the bar by the same amount.
- **Chat** (frame 5): the message input docks directly above the bar.

## 7. When the bar hides

- **Immersive screens** (frame 6): hide it on the full-screen player and on any screen that has its own bottom toolbar, such as the Create flow steps. Find these in the codebase and give the layout a flag so a route can opt out.
- **While the on-screen keyboard is open:**
  - in the native app, use the Capacitor Keyboard plugin's show and hide events;
  - on the web, treat it as open when `window.visualViewport.height` is more than 150px smaller than `window.innerHeight`.
- **While a full-screen sheet or modal is open,** it stays where it is, covered by the scrim.

## Don't change

- Anything at `md` and up: sidebar, header, chat button.
- Routes or the nav config content.
- Page content.
