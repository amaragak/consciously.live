# Manifest › Manifesto (Edit view): calmer hero, and a Foundations card row

Two changes to the Edit view, so the page reads as one dashboard:
1. The vision board hero loses its pattern band and becomes a rounded block.
2. The Values, Quotes and Questions bands become a row of three cards, with Quotes and Questions getting their own pages.

Change only what's listed here.

**Reference:** `docs/design/app/ManifestoAltA.dc.html` and `ManifestoAltA.png`.
- **What to port:** the hero as a rounded block and the "Foundations" row, in px from the HTML source.
- **Ignore:** the story, life areas, This month and Guides (they stay as they are in the app), the board captions and the sample content.
- **Styling:** existing tokens by role only. Use the app's standard chevron at its standard size.

---

## Part 1 · Vision board hero without the pattern band

The hero sits in a full-width band filled with the high-contrast pattern; with the photos and overlay on top it is too busy.

### 1.1 Remove the band

- **Background:** remove the hero's band background (the pattern) and its full-bleed container. The hero sits directly on the normal page background, the same faint pattern as the rest of the page.
- **Position:** inset the hero by the same horizontal padding as the story card and the sections below, so its left and right edges line up with the story card.
- **Spacing:** use the page's top padding above the hero. Below it, use the same gap the page uses between sections, so there's no hard edge between hero and story card.
- **No content-width changes:** don't add a width or centring. The hero simply fills the content area within that padding, like the story card.

### 1.2 Hero as one rounded block

- **Container:** the whole hero (image grid, overlay and centred content) is one block with radius **16px** and `overflow: hidden`.
- **Tiles:** they keep their current gap and their own radius.
- **Overlay:** the darkening overlay (linear and radial) is clipped to the block, so it ends with the block's rounded corners and never spills onto the page.
- **Unchanged:** the edit pencil stays at the block's top-right, with the same inset as now. The statement, the "My manifesto" eyebrow, "Open vision board", "Meditate on this" and the scroll chevron stay as they are.

### 1.3 Empty "Add image" tile

It currently renders as a bright white tile that out-shines the statement. It should look like an empty slot inside the dimmed panel:
- **Background:** white at about **12%** opacity, over the photo-grid layer and under the overlay.
- **Border:** **1.5px** dashed, white at about **40%**, with the tile's existing radius.
- **Label:** the "+" icon and "Add image" in white at about **85%**, the same size and weight as now.
- **Hover:** background white at about 18%, border at about 60%.
- **Unchanged:** clicking still opens the add-image flow.


## Part 2 · Foundations row


### 2.1 Remove the bands

Remove the Values, Quotes and Questions to yourself bands from the Edit view, including their band backgrounds. Keep all their data and the editing logic, because sections 2.2, 2.4 and 2.5 reuse it.

### 2.2 Foundations row

**Position:** after the This month card, before Guides.

**Section header:** use the same header component as "Your life areas" and "Guides".
- Title "**Foundations**".
- Subline "What everything else is built on."

**Grid:** three equal cards, a **14px** gap, `align-items: stretch` so they're all the same height.

**Card (shared):**
- **Container:** card surface, 1px card border, radius **16px**, the cards' usual small shadow, padding **20px**, a column with a **14px** gap.
- **Header row:** title in the app's serif at **22px**, with a text link on the right (13px, 600, label colour, chevron).
- **Body:** as per card, below.
- **Footer row:** pinned to the bottom (`margin-top: auto`), with 12px top padding, a 1px top border and 13px muted text. Counts on the left, actions on the right ("+ Add": 13px, 600, label colour, plus icon).

#### Values card
- **Header:** "Values", with the link "**Edit**".
- **Body:** values as wrapping chips with an **8px** gap. Each chip has padding 7px 14px, radius 999px, an accent-tint background, a 1px light-accent border and 14px heading-colour text.
- **More than 8 values:** show the first 8, then a "+{n} more" chip in the same style but with label-colour text. It opens the editor.
- **Footer:** "{n} values" · "+ Add".
- **Edit and + Add:** both open the existing values editor (add, rename, reorder, remove) in the app's dialog on desktop and sheet on mobile. "+ Add" opens it with a new empty row focused.

#### Words to keep card
- **Header:** "Words to keep", with the link "**Open**", which goes to the Words to keep page (section 2.4).
- **Body:**
  - "Today" in 11px caps, letter-spacing 1.4px, 600, muted;
  - the quote in serif italic **19px**, line-height 1.42, clamped to **4 lines**;
  - the attribution "— {author}" in 13px, 600, label colour (omit it if there's no author).
  - If the quote is clamped, add "Read more" after it (13px, 600, label colour). It opens the page scrolled to that quote.
- **Which quote:**
  - one per local day;
  - pinned quotes come first;
  - after that, cycle through all quotes in a shuffled order without repeats until every one has been shown;
  - store the cycle position per user.
- **Footer:** "{n} quotes" on the left. On the right, "**Another**" (refresh icon, 13px 600, label colour), which shows the next quote in the cycle without changing today's pick for later visits, then "+ Add".
- **Empty:** the body reads "No quotes yet. Add words that keep you steady." in 14px body colour, and the footer shows only "+ Add".

#### Questions to yourself card
- **Header:** "Questions to yourself", with the link "**Open**", which goes to the Questions page (section 2.5).
- **Body, when there are unanswered questions:**
  - "Not answered yet" in 11px caps, muted;
  - the oldest unanswered question in serif **20px**, line-height 1.32;
  - an outline "**Answer**" button (34px high, padding 0 14px, 13px 600). It opens the existing answer editor for that question.
- **Body, when all are answered:**
  - "Revisit" in 11px caps, muted;
  - a random answered question in serif 20px;
  - the first line of its answer in 14px body colour, clamped to 2 lines;
  - an outline "**Revisit**" button that opens it.
- **Footer:** "{answered} of {total} answered" · "+ Add".
- **Empty:** "No questions yet. Add one to come back to when things feel noisy." with "+ Add" only.

#### All three empty (new users)
Replace the three cards with one full-width card with the same styling:
- title "**Start your foundations**";
- the subline "Your values, words to keep and questions to come back to." in 14px body colour;
- a row of three outline buttons with a 10px gap: "+ Add values", "+ Add a quote", "+ Add a question".

### 2.3 Responsive

| Breakpoint | Layout |
|---|---|
| `xl` and up | Three cards in a row, as drawn. |
| `md` | Values full width on top. Words to keep and Questions side by side below it, 14px gap. |
| `sm` and below | One column, stacked, 12px gap. The Values chips become a single horizontal scroll row (no wrap, hidden scrollbar, 8px gap), and "+{n} more" isn't used. |

### 2.4 Words to keep page

**Route:** `/manifest/words` (or the app's equivalent nested route).

**Header:** the app's standard page header with a back link to the Manifesto, the title "**Words to keep**", and the subline "Words you want to keep close." On the right, the primary "**+ Add quote**" button.

**List:**
- **Cards:** each quote on its own card. Card surface, 1px card border, radius 16px, padding 20px. Inside: the quote in serif italic **22px**, line-height 1.42, then the attribution as on the overview card.
- **Columns:** two from `md` up (14px gap), one below.
- **Pin:** a pin toggle at each card's top-right (outline 30px circle, filled accent tint when pinned). Pinned quotes sort first, and pinned ones lead the daily rotation.
- **Card menu:** on hover (desktop) or a tap on the "⋯" button (mobile): Edit, Remove.
- **Reorder:** drag to reorder, using the app's existing drag handling. Order affects only this page, not the rotation.
- **Search:** a field above the list, shown when there are more than 8 quotes, filtering by text and author.

**Add and edit:** reuse the existing quote editor in the app's dialog (desktop) or sheet (mobile).

### 2.5 Questions page

**Route:** `/manifest/questions`.

**Header:** as in section 2.4, with the title "**Questions to yourself**", the subline "Come back to these when things feel noisy." and the primary "**+ Add question**" button.

**Sections:**
- "**Not answered yet**" first, then "**Answered**". Each has a section label in 12px caps, letter-spacing 1.6px, 600, label colour.
- Hide a section when it's empty.

**Question cards:**
- **Container:** card surface, 1px card border, radius 16px, padding 20px. A 3px left accent rule (`box-shadow: inset 3px 0 0`): light-accent when unanswered, accent when answered.
- **Contents:**
  - the question in serif **22px**;
  - the answer in 15px body colour, line-height 1.6, or for unanswered questions "Add your answer" (14px, 600, label colour, chevron), which opens the answer editor.
- **Columns:** one column at every breakpoint, because answers are prose.
- **Card menu:** Edit question, Remove.

### 2.6 Print and data

- **The Manifesto (poster) view is unchanged.** It still shows values and words to keep exactly as now.
- **Pin:** pinning is new. Add `pinned: boolean` (default false) to quotes if it doesn't exist.


## Don't change

- The hero's grid layout and image count, and the statement styling.
- The story card, life areas, This month and Guides.
- The Manifesto and Story views.
- The sidebar.
- On mobile, the hero is the same rounded block, inset like the cards below it. Nothing else about it changes.
