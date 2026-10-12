# Meditation detail page + mobile Library card (+ script timing, phased)

## Scope

1. **Meditation detail page** at `/meditate/library/:id`. Every meditation card in Library (My creations, Community, Program sessions) opens it. The card's play button still plays in place.
2. **Mobile Library card:** a re-layout below `md`.
3. **Script timing** (backend + frontend), done in phases (section 5). The page must work fully **without** timings first.

**Don't touch:**
- the desktop Library card;
- the player strip, except where noted;
- other pages;
- colour tokens.

**Existing links:** wherever earlier work linked to "the meditation's existing detail view" (overview cards, the Reflect card's "Open"), point it at this page.

## Reference

- `docs/design/app/MeditationDetail.dc.html` and `MeditationDetail.png`:
  - **left:** desktop;
  - **right:** mobile.
- `docs/design/app/LibraryCardMobile.dc.html` and `LibraryCardMobile.png`.

Port the structure and px from the HTML source. Ignore the board titles and sample data.

## Colours and icons

**Colours:** use the existing tokens by role:
- card surface, card border, heading, body and muted text, label/accent text;
- accent (stars, the active script line's inset, the reflection-count badge);
- accent tint (the active script line);
- the primary button and primary play-circle styles, and the outline button style;
- the existing tag style.

**Icons:** use the app's standard icons (pen for Reflect, heart, ⋯, play/pause). The "‹" in the design is the app's standard chevron-left at its standard size.

## 1. Detail page: desktop

**Shell**
- Library's shell and tabs, with the tab the user came from active.
- **Back link:** "{tab name}" with the standard chevron-left (14px, 600, label colour). It goes back to that tab, keeping its filters and scroll position.

**Layout**
- A column with a **14px** gap: the header card, then a row with a **20px** gap and items aligned to the top, holding the script card (`flex: 1`) and a **320px** rail.
- Add bottom padding so the player strip never covers content.

**Header card** (padding **24px**, a row with a **28px** gap)
- **Cover:** **240×240**, radius **14px**.
- **Right column** (**12px** gap):
  - the eyebrow: type in label style, then "· Made {date, time}" in 12px muted;
  - the title in serif **34px**, line-height 1.15;
  - the full description: 15px, line-height 1.6, body colour, `max-width: 720px`;
  - the meta row (13px, **14px** gap, with "|" separators in the border colour):
    - the voice avatar (22px) and name;
    - the soundscape name;
    - the **star rating**, 16px, interactive for your own meditations, with "Your rating" in muted. It uses the existing rating data.
  - the actions row (`margin-top: auto`, **10px** gap):
    - "**Play · {duration}**": primary, **48px**, with a 34px play circle inside. It plays through the global player and shows pause while this one is playing;
    - "**Reflect**": outline, 44px, pen icon. It uses the existing Reflect behaviour;
    - "**✦ Make a variation**": outline, 44px. It opens Create with this meditation's brief, style or program, context, voice and sound pre-filled. **Own meditations only.** Hide it if Create can't be pre-filled; don't fake it;
    - a heart (44px icon button);
    - ⋯ (44px icon button), holding the existing actions: share, download, delete, etc.

**Script card** (`flex: 1`)
- **Header row:** padding **16px 20px**, 1px bottom border.
  - "Script" in serif **22px**;
  - "{n} words" in 13px muted;
  - on the right: the **Follow along** switch (existing switch component), only when timings exist, then "**Copy**" (13px, 600, label colour), which copies the plain script.
- **Body** (padding **8px 10px 16px**):
  - **Section labels** (if the script has sections): padding **14px 14px 4px**, 10px uppercase muted.
  - **Paragraphs / chunks:** padding **10px 14px**, radius **10px**, **16px** gap.
    - a **40px** timestamp column (12px, tabular, muted), shown only when timings exist;
    - the text in serif **17px**, line-height 1.65, body colour.
  - **Pause marker** (only when the pause data exists): a centred line reading "pause · {n}s" in 11px muted, between 120px rules, with a **64px** left inset.
- **Without a script:** show "The script for this meditation isn't available." in muted, and hide the card body.

**Rail** (**14px** gap). Each card: padding **16px 18px**, **8px** gap, with an eyebrow label.
1. **Made from** (own meditations, only if the data exists):
   - the original brief in italic serif **15px**;
   - tags for the style or program and any context (journal entry, Manifest goal), using the existing tag style.
2. **Sound & voice:** label/value rows (13px, a 1px top border each, muted label, value right-aligned) for Voice (with a 18px avatar), Soundscape (or the mix name), Pacing, Echo and Length. Show only the rows whose data exists.
3. **Reflections · {n}:**
   - linked journal entries, each with the title (14px, 600) and "{relative date} · "{excerpt}"" (12px muted), opening the entry;
   - then "**+ New reflection**" (13px, 600, label colour), which uses the Reflect behaviour.

**Community meditations:** no rating editing, no Made from, no Make a variation. Everything else stays.

## 2. Detail page: mobile (below `md`)

- **Back link**, then the header card:
  - the cover at full width, **200px** high;
  - padding **16px**, **10px** gap: the eyebrow "{type} · {duration}", the title in serif **24px**, a meta line (avatar, voice, date, stars at 13px), then the action row:
    - **Play:** primary, 48px, flex 1;
    - **Reflect, heart, ⋯:** 44px icon buttons.
  - **Make a variation** moves into ⋯.
- **Tabs below:** a segmented control with **Script / Details / Reflections · {n}**.
  - **Script:** the script card body, with text at 16px.
  - **Details:** Made from + Sound & voice.
  - **Reflections:** the reflections list.

## 3. Mobile Library card (below `md`)

Replace the current mobile card with this. Container: padding **12px**, radius 14px, a column with a **10px** gap.

1. **Top row** (**12px** gap):
   - the cover at **72×72**, radius 10px, with a **30px** play circle centred on it (plays in place);
   - the text column:
     - the eyebrow: type (10px, uppercase, letter-spacing 1.2px, 600, label colour), then "· {duration}" (12px muted, normal case);
     - the title in serif **16px**, line-height 1.3, 2 lines.
2. **The description:** 13px, line-height 1.45, 2 lines, full width.
3. **Footer:** a 1px top border, padding-top **8px**, items centred, **6px** gap.
   - **Left** (flex 1, ellipsis): the voice avatar (18px), then "{voice} · {short date}" in 12px muted;
   - **Right:** three **34px** icon buttons:
     - **Reflect**, with a gold count badge at the top-right when n ≥ 1: min-width 16px, 16px high, 10px bold, white text;
     - **heart;**
     - **⋯.**

**Removed on mobile:** star rating, time of day, the separate type pill, the "{n} reflections" text link, and the standalone Reflect row.

**Tapping** the card body opens the detail page.

## 4. Data needed by the page

Use what already exists. For anything missing, hide that UI and **tell me what's missing**, rather than inventing data. The fields involved:
- brief and context;
- generation settings (pacing, echo, sound);
- the script text and any sections;
- the rating.

## 5. Script timing (phased; report after each phase)

Meditations are generated in **chunks**, so each chunk's position in the final audio can be known.

**Phase A: data contract and frontend, no backend changes**
- Define the shape the page consumes:
  `scriptChunks: Array<{ index: number; section?: string; text: string; startMs?: number; endMs?: number; pauseAfterMs?: number }>`
- Render from it. If the API only returns a plain script, split it into paragraphs as chunks with no timings.
- **Timing-only UI:** the timestamps, the Follow along switch, the active-line highlight and click-to-seek appear **only** when `startMs` exists for the chunks.

**Phase B: backend, recording timings at generation**
- In the generation pipeline, when the chunk audio is concatenated, record each chunk's `startMs` and `endMs`. Use the actual decoded duration of each chunk, plus any inserted pauses or silence. Record `pauseAfterMs` where pauses are added.
- Persist the chunk list with the meditation, and return it from the meditation detail API.
- **Backfill:** if per-chunk audio or durations are stored for existing meditations, write a one-off script that computes timings. If they're not stored, existing meditations stay untimed. Tell me which.

**Phase C: follow along**
- **Active chunk:** while this meditation is the current item in the global player, the active chunk is the one where `startMs <= position < endMs`. It gets the accent tint and a 3px accent inset on the left, its timestamp turns label colour, and its text turns heading colour.
- **Follow along on:** keep the active chunk in view, smooth-scrolling within the page. Pause auto-scroll for 5s after the user scrolls manually.
- **Click to seek:** clicking a chunk seeks the player to its `startMs`, loading this meditation first if it isn't current.
- **Default:** Follow along is on, and the preference is remembered per user.

Stop after Phase A and tell me before starting Phase B, so I can review the timing approach.
