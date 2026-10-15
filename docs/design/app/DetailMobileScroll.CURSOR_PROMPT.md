# Meditation detail, mobile: breadcrumb + compact sticky bar

## Scope

Change only the meditation detail page (`/meditate/library/:id`), **below `md`**:

1. Shorten the header breadcrumb.
2. Add a compact sticky bar that appears once the page's tabs have scrolled away.

**Don't touch:**
- desktop (`md` and up);
- the back link, header card, tabs, script, Details and Reflections content;
- the player strip;
- other pages;
- colour tokens.

## Reference

`docs/design/app/DetailMobileScroll.dc.html` and `DetailMobileScroll.png`:
1. the page at the top;
2. scrolled, while this meditation isn't playing;
3. scrolled, while it's playing.

Port the structure and px from the HTML source. Ignore the board titles and sample text.

## Colours and icons

**Colours:** use the existing tokens by role:
- card surface and card border;
- heading and body text;
- accent (the active tab underline);
- the primary play-circle style.

**Icons:** use the app's standard chevron at its standard size in the breadcrumb, and the standard play icon.

## 1. Breadcrumb (below `md`)

- Drop the meditation name crumb. The breadcrumb ends at **Meditate › Library**.
- **"Library"** is a link to the Library page.
- The header doesn't change on scroll: no fading and no title swap.

## 2. Sticky bar (below `md`)

**When it shows**
- It shows once the in-page tabs (Script / Details / Reflections) have **fully scrolled up under the app header**, i.e. the tabs' bottom edge has passed the header's bottom edge.
- It hides again as soon as the in-page tabs come back into view.
- Use an IntersectionObserver on the in-page tabs, with a top `rootMargin` equal to the header height, not a scroll listener.
- It appears and disappears instantly, with no fade.

**Position**
- Fixed directly under the app header, spanning the content area's full width.
- It overlays the content, so it must not shift the page layout when it appears.
- Below the header and above the content in z-order. The player strip still sits above it.

**Container:** card surface, a 1px bottom border, a soft shadow (`0 4px 10px` at low opacity, as in the design).

**Row 1** (**44px** high, padding **0 12px 0 16px**, items centred, **10px** gap)
- **Meditation title:** serif **16px**, heading colour, one line with an ellipsis, `flex: 1; min-width: 0`. Tapping it smooth-scrolls the page to the top.
- **Play button:** a **30px** primary play circle, shown **only when this meditation isn't the current item in the global player**. It plays through the global player, the same as the header card's Play. Once this meditation is the current item, hide it; the player strip handles play and pause.

**Row 2** (a 1px top border, padding **0 8px**, `display: flex`)
- The same three tabs as the page: **Script / Details / Reflections · {n}**.
- Each tab: `flex: 1`, **34px** high, centred, 13px.
  - **Active:** weight 600, heading colour, and a **2px** accent underline drawn as an inset bottom shadow, so the height doesn't change.
  - **Inactive:** body colour.
- **Shared state:** these tabs and the in-page tabs use the same tab state, so switching in either place updates both.
- **Switching tabs from the bar:** scroll so the top of the new tab's content sits just below the sticky bar, not hidden under it.

## 3. Offsets

While the bar is visible, anything that scrolls content into view on this page must account for the header plus the bar (about **79px** for the bar). That includes follow-along auto-scroll, click-to-seek and tab switching. Use `scroll-margin-top` on the script chunks and tab panels, or the equivalent offset in the scroll logic.
