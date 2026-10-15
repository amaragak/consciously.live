# Manifesto print: the story as a chapter (Full · Summary · Choose · Off)

Add the user's story to the Manifesto print view as its own chapter, after the life areas and before "Words to keep". The print view itself stays as built. This prompt adds the chapter, its compose-mode control, and the data it needs.

**Reference:** `docs/design/app/ManifestoStoryPrint.dc.html` and `ManifestoStoryPrint.png`, which show three prints: Full (with headings), Summary, and Choose (summarised). Port px from the HTML source and ignore the board captions and sample text.

**Styling:**
- **Colours:** existing tokens by role only.
- **Fonts:** the print's existing display/text serif and caps styles.

---

## 1. Data

### 1.1 Sections on the prepared version

"Prepare for narration" must keep the story's structure. Change the compose step so the model returns, and you store on the `StoryVersion`:

```
sections: Array<{
  promptId: string | null   // null for text written before the first prompt label
  heading: string           // short print heading, 1–4 words, e.g. "Waking up", "The music"
  text: string              // the third-person rewrite of that section
}>
```

- **One section per prompt label in the draft,** in order. Text written before the first label becomes a section with `promptId: null` and heading "Opening".
- **Headings** are short plain nouns or phrases written for print, never the prompt question itself.
- **Keep `thirdPersonText`** as `sections.map(s => s.text).join('\n\n')`, so narration and the Story B view are unchanged.
- **Older versions without sections** are treated as one section, heading "Opening".

### 1.2 Print settings

Store these per user, on the manifesto print settings alongside any existing ones:

```
storyOnPrint: {
  mode: 'full' | 'summary' | 'choose' | 'off'   // default 'full' once a prepared version exists, else 'off'
  showHeadings: boolean                         // full mode only; default true
  chosen: string[]                              // section keys: promptId, or 'opening'
  chooseStyle: 'written' | 'summarised'         // default 'written'
}
```

### 1.3 Summaries (cached per prepared version)

- **Whole-story summary:** 130–170 words. Third person by first name, present tense, plain language. Keep the most specific details and the ambition, and don't add facts.
- **Section summaries:** 1–3 sentences per section, same rules.
- **When they're generated:** on first need, using the existing LLM integration. Store them on the `StoryVersion` as `summary` and `sectionSummaries: Record<sectionKey, string>`.
- **User edits:** the user can edit them. Edits are saved over the cached text.
- **Regenerate** replaces them. A new prepared version starts with no summaries.

## 2. The chapter on the print

Insert it after the last life area and before "Words to keep", with a **56px** top margin.

- **Header:** "{FirstName}'s story", centred between two rules. Use the same label style as "My manifesto" at the top of the print.
- **Text column:** max-width **640px**, centred within the print. Serif **17px**, line-height 1.75, ink colour. The rest of the print is unchanged.

### Full
- Every section in order.
- **With headings on,** each section starts with its heading in caps (10.5px, letter-spacing 2.2px, label colour), 6px above the text, and sections are **28px** apart.
- **With headings off,** sections follow on with no headings, and the gap stays the same.
- **Paragraphs:** the very first paragraph has a drop cap (display serif, 300 weight, **76px**, line-height 0.8, ink, padding 8px 12px 0 0, floated left). Each section's first paragraph has no indent, and later paragraphs are indented 28px.

### Summary
- The whole-story summary as one passage, with the drop cap. There are no headings.

### Choose
- Only the chosen sections, in story order, each under its heading. Sections are **26px** apart.
- **As written:** the section's full text.
- **Summarised:** its section summary as a single paragraph with no indent.
- **No drop cap** in Choose.

### Off
- No chapter.

### Printing
- Apply `break-inside: avoid` to each heading together with its first paragraph.
- The chapter is included in the PNG export and in Print. Nothing from section 3 is.

## 3. Compose-mode control

A floating panel in the right margin, top-aligned with the chapter header. It's shown only in compose mode, never in Preview, export or print. It's absolutely positioned and never shifts layout.

- **Panel:** width **262px**, padding **12px**, **10px** gap, radius **16px**, card surface, a 1px card-border border, soft shadow.
- **Title:** "Story on the print" in 10px caps, letter-spacing 1.4px, 600, muted.
- **Mode control:** a segmented control on a progress-track pill (padding 3px, fully rounded, 12px, 600) with the options **Full · Summary · Choose · Off**. The active segment uses the selected-chip style.
- **Under it, depending on the mode:**
  - **Full:** a checkbox, "Show prompts as headings" (13px).
  - **Summary:** the hint "AI summary of the whole story, about 150 words. Click the text to edit it." in 12px muted, then "Regenerate" (sparkle icon, 12px, 600, label colour).
  - **Choose:**
    - A 1px top rule, then one checkbox row per section: heading (13px), and the word count right-aligned (11px muted). Unchecked rows are muted.
    - Then a two-option segmented control, **As written · Summarised**. The active option is on the card surface with a small shadow.
    - Then "Regenerate summaries" (sparkle icon, 12px, 600, label colour), shown only when Summarised is selected.
  - **Off:** nothing extra.
- **Editing summaries:** in compose mode, clicking the summary text (or a section summary) makes it editable in place. It saves on blur.
- **No prepared version yet:** the chapter area shows a dashed slot in compose mode only: "Write your story and prepare it for narration to add it here →", linking to the Story tab. The control isn't shown.
- **Mobile:** the panel opens as a bottom sheet from a "Story" button placed beside the chapter header in compose mode.

## Don't change

- The rest of the print: header, values, life areas, Words to keep, footer.
- The Story editor.
- Narration.
