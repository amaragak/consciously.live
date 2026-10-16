# Manifest: remove the Edit / Manifesto / Story switch; Story and Poster become their own pages

The Manifest header has a segmented switch: **Edit · Manifesto · Story**. Tabs should reveal different content, not different presentations of the same page, so:
- **Edit** becomes the Manifesto page itself. There's no "Edit" label anywhere.
- **Story** becomes a normal page in the sidebar.
- **Manifesto** (the print / poster view) becomes a page opened from a button, renamed **Poster**.

Change only what's listed here.

**Reference:** `docs/design/app/ManifestoNoTabs.dc.html` and `ManifestoNoTabs.png`.
- **What to port:** px for the new title rows and buttons.
- **Ignore:** the hero, story card, life areas and poster content on the board (they stay as they are in the app), the board captions and the sample content.
- **Styling:** existing tokens by role only. Use the app's standard chevron at its standard size.

---

## 1. Remove the switch

- **Header:** remove the Edit / Manifesto / Story segmented control from the app header, on desktop and mobile. The header's centre is empty on Manifest pages, like the other sections.
- **Header label:** the label next to the logo shows the current page ("Manifesto", "Story", "Poster", "Vision board" or the life area name), as on other sections.

## 2. Routes

| Page | Route | Was |
|---|---|---|
| Manifesto | `/manifest` (unchanged) | the Edit view |
| Story | `/manifest/story` | `?view=story` |
| Poster | `/manifest/poster` | `?view=manifesto` |

- **Story tab:** keep the Story page's tab parameter, as `/manifest/story?tab=draft|narration`.
- **Old links:** redirect the old `?view=…` URLs (with `tab`) to the new routes, so existing links and notifications keep working.
- **Update every internal link** that opened a view, including:
  - the Manifesto page's story card ("Edit story" and the card body);
  - the Library pinned story;
  - the dashboard story card and the story row;
  - the Story notification;
  - anything else that set `view=`.

## 3. Sidebar

- **New item:** under **Manifest**, add **Story** between Manifesto and Vision board, in the same style as the other sub-items.
- **Active states:**
  - Story is active on `/manifest/story`;
  - Manifesto stays active on `/manifest/poster`, because the poster is part of the Manifesto.

## 4. Manifesto page: title row

**Placement:** add a title row at the top of the page content, above the hero.
- **Padding:** the page's usual horizontal padding, with **24px** at the top.
- **Row:** `align-items: center`, `justify-content: space-between`, a 16px gap.

**Contents:**
- **Left:** "**Manifesto**" in the app's serif, **30px**, line-height 1.1, heading colour.
- **Right:** "**View as poster**", an outline button.
  - **Size:** 40px high, padding 0 16px, fully rounded.
  - **Style:** card surface, 1px card border, 14px 600 heading-colour text, with a frame icon at 16px before the label and an 8px gap.
  - **Action:** opens `/manifest/poster`.

**Spacing:** the hero follows with an **18px** gap, replacing the hero's current top padding.

**Mobile (below `sm`):**
- the title is **26px**;
- the button becomes a **40px** circular icon button (same outline style, frame icon at 17px) with `aria-label` "View as poster";
- the row's top padding matches the page's mobile top padding.

## 5. Poster page

**Contents:** the existing print / poster view and its controls (Export, Page, Arrangement), unchanged, on its own route.

**Title row** (desktop), with the page's usual horizontal padding, 20px top, a 14px gap:
- a back link "**‹ Manifesto**": 14px, 600, label colour, using the app's standard back chevron. It goes to `/manifest`.
- a 1px card-border divider, 18px tall;
- "**Poster**" in the app's serif at **24px**.

The poster and its action column follow with an 18px gap.

**Mobile:**
- the row is the back link on the left, with the Arrangement control as a **40px** circular icon button on the right (outline, panel icon);
- "Save as image" stays at the bottom as now.

**Browser back** from Poster returns to Manifesto.

## 6. Story page

- **Content:** the existing Story view on its own route, unchanged inside: the header card, the My draft / For narration toggle and the side cards.
- **Title:** the page title stays as the Story header card has it now. There's no extra title row.

## Don't change

- The content and behaviour of the Manifesto page, the Story page and the Poster, apart from the routes and the title rows above.
- The Vision board and life area pages.
