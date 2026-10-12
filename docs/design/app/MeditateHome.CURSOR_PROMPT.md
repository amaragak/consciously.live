# Meditate overview page (`/meditate`)

## Scope

Add a new overview page at **`/meditate`**. That route doesn't exist yet.
- It's a mini summary of the Meditate area.
- It **doesn't replace the existing app dashboard**: keep that as it is.
- **Also add** a simple Guides index and reader (section 6).

**Don't touch:**
- Create, Library, Sounds or their tabs;
- the app dashboard;
- other pages;
- colour tokens.

## Reference

`docs/design/app/MeditateHome.dc.html` and `MeditateHome.png`:
- **left:** desktop;
- **right:** mobile.

Port the structure and px from the HTML source. Ignore the board titles and the sample content; bind everything to real data.

## Colours and icons

**Colours:** use the existing tokens by role:
- card surface and card border, label/accent text, heading and muted text;
- accent (progress segments), accent tint and the light-accent border (the New tile);
- the primary play-circle and primary button styles;
- the existing tag styles from Library for meditation types.

**Icons:** use the app's standard icons. Wherever the design shows "›", use the standard chevron-right at its standard size.

## Layout

- Use the app's **existing default content area** (as on the Library page) and the existing page padding.
- Content is a column with a **28px** gap between sections.
- **Section heading row:** space-between, baseline-aligned, with a **12px** bottom margin.
  - title: serif **22px**, heading colour;
  - optional link on the right: 14px, 600, label colour, then the standard chevron-right.
- Render a visually hidden `<h1>Meditate</h1>`.

**Navigation**
- The sidebar's **"Meditate"** parent item links to `/meditate` and shows the active state there. None of its children are active on this page.
- The header breadcrumb label on this page is **"Overview"**, using the existing breadcrumb pattern.
- No tabs or stepper.

## 1. Your meditations

**Heading:** "Your meditations", with the link **"Library"** going to Library · My creations.

**Grid**
- At `md` and up: `repeat(4, minmax(0,1fr))`, **14px** gap.
- Below `md`: 2 columns, **10px** gap.

**First cell: the New tile** (links to Create, Start step)
- Accent-tint background, a **1.5px** dashed light-accent border, radius **14px**, centred column with a **10px** gap.
- **Contents:**
  - a **52px** circle in the primary play-circle style, with the standard plus icon;
  - "New meditation" in serif **18px**;
  - "Opens Create" in 12px, muted.
- **Mobile:** **44px** circle, serif 16px, no sub-line, min-height **160px**.

**Next cells: the user's 3 most recent meditations**
- Use the same source as Library · My creations.
- **Card:** card surface, 1px border, radius **14px**, overflow hidden.
- **Image area:** **132px** high (mobile **92px**), with the meditation's cover image.
  - a play circle at left/bottom **10px**: **38px** (mobile 30px). It plays through the existing player;
  - a duration pill at right/bottom **10px**: padding **2px 8px**, pill, a translucent dark-heading fill, light text, 11px.
- **Body:** padding **10px 12px 12px**, **6px** gap.
  - **Title:** serif **15px** (mobile 14px), line-height 1.3, clamped to 2 lines.
  - **Meta row** (12px, muted, **6px** gap): the voice avatar at **18px** (portrait, or initials on the tint), then "{voice} · {relative date}", then the type tag right-aligned. **Mobile:** drop the voice name and the tag; keep the avatar and the date.
- **Click:** clicking the card (not the play button) opens the meditation's existing detail view.

**Empty state:** with no meditations, show only the New tile, plus "Your meditations will appear here." in 13px muted text beside it.

## 2. In progress (conditional)

- **Show only** when the user has a program with at least one session completed and at least one not completed. Use the most recently played one.
- **Data:** if program progress isn't tracked yet, tell me and leave this section out. Don't fake it.

**Desktop:** one row card, padding **10px 14px**, items centred, **14px** gap.
- **Contents, left to right:**
  - the program's image at **44×44**, radius **10px**;
  - a column with "In progress" (10px, uppercase, letter-spacing 1.4px, 600, label colour) above the program title (serif **16px**, `nowrap`);
  - progress segments: one per session, **120px** total, **4px** high, **4px** gaps; completed in the accent, the rest in the border colour;
  - "Next: {n} · {session name} · {length}" in 13px, muted, `nowrap`;
  - "Play next" (primary, **38px**) on the right. It plays the next session.
- **Click:** clicking the card elsewhere opens the program.

**Mobile:** the same card, stacked, padding **12px 14px**, **10px** gap.
- **Line 1:** the image and the title column.
- **Line 2:** the segments at full width.
- **Line 3:** "Next: …" (flex 1), then Play next at **36px**.

## 3. Explore

**Heading:** "Explore".

**Grid**
- At `md` and up: 2 columns, **14px** gap.
- Below `md`: stacked, **10px** gap.

**Two cards: Library and Sounds**
- **Header:** padding **16px 18px 6px**, **14px** gap.
  - a **52px** image tile, radius **12px**, using existing app imagery. If none fits, use an accent-tint tile with that section's sidebar icon;
  - the title in serif **19px**;
  - a 13px muted description: "Everything you've made and found" or "Backgrounds and voices". On mobile there's no description, the tile is **40px** and the title is serif **17px**.
- **Link rows** (padding **4px 18px 8px**): each row is padding **9px 0**, with a 1px top border, 14px heading text, and the standard chevron-right on the right.
  - **Library:** "My creations · {count}", "Community", "Programs · {count}". Each goes to that Library tab.
  - **Sounds:** "Soundscapes · {count}", "Voices · {count}", "Custom sounds". Each goes to that Sounds tab.

## 4. Guides

**Heading:** "Guides", with the link "All guides" (on mobile, "All") going to `/meditate/guides`.

**Desktop:** a grid of `repeat(4, minmax(0,1fr))`, **14px** gap, showing the first 4 guides.
- **Card:** card surface, 1px border, radius **14px**, overflow hidden.
- **Contents:**
  - the image, **110px** high, cover;
  - a body with padding **12px 14px 14px** and a **6px** gap:
    - the category in 10px uppercase label style;
    - the title in serif **16px**, line-height 1.3, clamped to 2 lines;
    - "{n} min read" in 12px muted.

**Mobile:** one card holding a list. Each row is padding **10px 12px**, **12px** gap, with a 1px top border except the first.
- a **64px** square image, radius **10px**;
- a column with the category, the title (serif **15px**) and the read time (11px).

**Click:** clicking a guide opens it.

## 5. Mobile (below `md`)

- **Page padding:** 16px.
- **Section gap:** 22px.
- **Section titles:** serif **20px**.
- **Sizes:** use the mobile values given in each section above.

## 6. Guides content and routes

**Content module**
- Add a static guides content module, for example `src/content/guides/*.md` with front-matter:
  - `slug`, `title`, `category`, `readMinutes`, `image`, `order`.
- Start with these four guides, each body clearly marked `draft: true` and holding short placeholder text:
  1. "What meditation actually is (and isn't)": Basics, 4 min.
  2. "Your first week: a gentle plan": Getting started, 6 min.
  3. "When your mind won't stop wandering": Practice, 5 min.
  4. "Breath, body scan or visualisation?": Choosing, 7 min.
- Use existing app imagery for the guide images for now.

**`/meditate/guides`**
- The same page shell, with the breadcrumb "Guides".
- All guides in the same card grid (list on mobile), ordered by `order`.

**`/meditate/guides/:slug`**
- An article on a single card, using the existing default content area.
- **Contents:**
  - the image at the top, about **240px** high, cover, with radius matching the card;
  - the category (label style);
  - the title in serif **32px** (mobile 26px);
  - "{n} min read" in muted;
  - the body rendered from markdown at readable prose sizes: 17px, line-height 1.7, serif headings.
- **Bottom:** a "More guides" row of up to 3 other guides, using the guide card.
