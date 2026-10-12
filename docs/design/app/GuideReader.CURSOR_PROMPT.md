# Guides: reader page + admin editor (database-backed)

## Scope

1. **Guide reader page**: `/meditate/guides/:slug` and `/journal/guides/:slug`, built to the design below.
2. **Guides admin**: a new **"Guides"** tab in the existing Admin, modelled on the existing **Read** tab (the blog post editor). It only needs to be functional; follow the existing admin styling.
3. **Data**: move guides from the static markdown module into the database, and make every place that lists guides read from it: the overview Guides sections, the guides indexes, the reader and "More guides".

**Don't touch:**
- the overview pages, except where they read guide data;
- the blog (`/read`) and its admin;
- other admin tabs;
- colour tokens.

## Reference

`docs/design/app/GuideReader.dc.html` and `GuideReader.png`:
- **left:** desktop;
- **right:** mobile.

Port the structure and px from the HTML source. The article text in the design is sample content; render the real guide.

## Colours and icons

**Colours:** use the existing tokens by role:
- card surface, card border, heading, body and muted text, label/accent text;
- accent (the progress fill, the active contents marker, the pull-quote rule);
- accent tint and light-accent border (the Try this box, the mobile practice card);
- page background (the Key idea box);
- the primary and outline button styles.

**Icons:** use the app's standard icons. Wherever the design shows "‹", "›" or "▾", use the app's standard chevrons at their standard size.

## 1. Data model

Add a `Guide` model (or table), editable from admin:

| Field | Notes |
|---|---|
| `id` | |
| `area` | `'meditate'` or `'journal'` |
| `title` | |
| `slug` | Unique per area; auto-generated from the title, editable |
| `summary` | Short text, used on cards |
| `category` | Free text with suggestions from existing values, e.g. Basics, Practice |
| `coverImage` | Upload, using the same storage as blog post images |
| `body` | Markdown with the shortcodes in section 4 |
| `practiceBrief` | Optional text (see section 3) |
| `status` | `'draft'` or `'published'` |
| `order` | Integer |
| `readMinutes` | Computed on save: words ÷ 200, rounded up, minimum 1 |
| `createdAt`, `updatedAt` | |
| `helpfulYes`, `helpfulNo` | Counters |

**Migration:** seed the database from the existing static guide files, then remove the static module and point all guide reads at the database.

**Visibility:** public pages only show `published` guides, ordered by `order`.

## 2. Reader page layout

**Shell**
- The existing page shell, with the breadcrumb "Guides" and the default content area.
- The sidebar parent is active: Meditate or Journal, by `area`.

**Back link:** "All guides" with a standard chevron-left at the top (14px, 600, label colour). It goes to that area's guides index.

**Desktop body:** a row with a **20px** gap and items aligned to the top. The article card is `flex: 1`, then the rail is **300px**.

**Article card**
- **Container:** card surface, 1px border, radius **16px**, overflow hidden.
- **Cover:** **280px** high, cover-fit.
- **Inner column:** padding **32px 44px 36px**, `max-width: 760px`, left-aligned within the card, a column with an **18px** gap.
  - the category in 11px, uppercase, letter-spacing 1.4px, 600, label colour;
  - the title as the `<h1>`, in serif **40px**, line-height 1.12;
  - the meta line in 13px muted: "{readMinutes} min read · {category} · Updated {Mon YYYY}";
  - a 1px divider;
  - the rendered body (section 4);
  - the helpful row, with a 1px top border and padding-top **18px**: "Was this helpful?" (14px), then "Yes" and "Not really" as outline pills (**34px**). They increment the counters once per user per guide, and after a vote show "Thanks" in place of the pills.

**Rail** (`position: sticky`, top offset matching the page's header spacing, **14px** gap)

Each rail card has the card surface, a 1px border, radius **16px**, padding **16px 18px** and a **10px** gap.

1. **In this guide**
   - the eyebrow label;
   - a **4px** reading progress bar: the accent fill shows how far the article has scrolled;
   - the list of `##` headings, each with padding **6px 0 6px 12px** and a 2px left border. The active one, chosen by scroll position, gets the accent border, heading colour and weight 600; the others get the border colour and body text.
   - Clicking a heading smooth-scrolls to it.
   - Hide this card if there are fewer than 2 headings.
2. **Put it into practice** (only when `practiceBrief` is set)
   - the eyebrow label;
   - a title in serif **17px**: "A {n}-minute sit for {…}" is just sample copy, so use the first line of `practiceBrief` as the title and any further lines as a 13px description;
   - a full-width primary button, **40px**:
     - **meditate area:** "✦ Make this meditation". It opens Create (Start step) with the brief pre-filled from `practiceBrief`.
     - **journal area:** "Write about this". It opens a new journal entry with `practiceBrief` as the prompt line.
3. **More guides**
   - up to 3 other published guides in the same area, same category first;
   - each row has a 1px top border and padding **8px 0**: a **48px** cover with radius **8px**, then the title (serif **14px**) above "{category} · {readMinutes} min" (11px muted).

**Mobile (below `md`)**
- A single article card.
- **Cover:** **180px** high.
- **Body:** padding **20px 18px 24px**.
  - **Title:** serif **28px**.
  - **"In this guide":** a collapsible row (padding **12px 14px**, radius 12px, 1px border, page background) reading "In this guide", with "{n} sections" and a chevron on the right. Expanding it shows the heading links.
  - **Text sizes:** body **16px** with line-height 1.65; lead serif **19px**; `##` headings serif **22px**.
  - **Practice card:** at the end of the article, on the accent tint with a light-accent border, padding **16px**, with a full-width **44px** button.
  - **Helpful row:** last.
- **Rail:** hidden, except that "More guides" appears below the card as the existing mobile guide list.

## 3. Practice brief behaviour

- **Create pre-fill:** use whatever mechanism Create already supports (query param or state) to fill the brief composer.
- **Journal prompt:** reuse the prompt behaviour from the Journal empty state.

## 4. Body rendering (markdown + shortcodes)

Render markdown with these styles:
- **The first paragraph** is the lead: serif **21px**, line-height 1.55, heading colour.
- **Paragraphs:** **17px**, line-height 1.7, body colour, no extra margin; spacing comes from the column gap.
- **`##`:** serif **25px**, weight 400, line-height 1.25, with **12px** top margin. Give each one an id for the contents links.
- **`###`:** serif 20px.
- **Lists:** 17px body, with comfortable spacing.
- **Links:** label colour, underlined on hover.
- **Images:** full column width, radius 12px.
- **`> quote`:** a pull quote. Padding **4px 0 4px 20px**, a **3px** accent left border, italic serif **21px**, line-height 1.5, heading colour.

**Shortcodes** (fenced blocks)

````
:::try 2 minutes
1. **Notice** — When you realise you're somewhere else, pause.
2. **Name it lightly** — Say "thinking" in your head.
3. **Come back** — Return to the next breath.
:::
````

- **`:::try`**: the Try this box.
  - padding **20px 22px**, radius **14px**, accent tint, 1px light-accent border, a column with a **14px** gap;
  - the eyebrow reads "Try this · {text after :::try}"; with no text, just "Try this";
  - each numbered item is a step: a **28px** circle with the number (card surface, light-accent border, label colour, 600, 13px), then the bold part as the step title (16px, 600) and the text after "—" as the description (15px, line-height 1.6).

````
:::key
Attention is a muscle, and wandering is the resistance it trains against.
:::
````

- **`:::key`**: the Key idea box.
  - padding **14px 16px**, radius 12px, 1px border, page background, **12px** gap;
  - a ✦ in the label colour, then "**Key idea:**" in heading colour followed by the text in 15px, line-height 1.6.

**Safety:** sanitise the rendered HTML.

## 5. Admin: Guides tab

**Placement:** add **"Guides"** to the admin tab row, next to "Read".

**Pattern:** copy the Read tab's layout and components: a list on the left with **New**, and an edit form on the right with **Save**.

**List**
- Each item shows the title, then "{area} · {category} · {status}".
- **Filters** above the list: All, Meditate, Journal.
- **Order:** by `order`. Up/down controls, or drag to reorder if the Read list already supports it, update `order`.

**Edit form** (top to bottom, with the same field components as the post editor)
1. Title.
2. Slug: auto-filled from the title until edited manually, with the URL shown below it: `/{area}/guides/{slug}`.
3. Area (select): Meditate or Journal.
4. Category: text input with suggestions.
5. Summary: a short textarea, labelled "Shown on guide cards".
6. Cover image: upload, replace and remove, as on the Read tab.
7. **Body:** a markdown textarea, plus a **Preview** toggle or side-by-side preview that renders with the **real reader body component**, so admin preview matches the live page.
   - Below the textarea, a collapsible **cheat-sheet** for the shortcodes (`:::try`, `:::key`, `>`), with copyable examples.
8. Practice brief: textarea, with the help text "Optional. Meditate: pre-fills Create's brief. Journal: becomes the entry prompt. First line is the card title."
9. Status: Draft or Published.
10. Read only: read time (live estimate), last updated, and the helpful counts (yes / no).

**Actions**
- **Save:** saves the guide.
- **"View"** link: opens the public page. For drafts it's allowed only for admins, with a "Draft" banner on the page.
- **Delete:** with confirm, as on the Read tab.

**Access:** admin-only, using the existing admin auth guard.
