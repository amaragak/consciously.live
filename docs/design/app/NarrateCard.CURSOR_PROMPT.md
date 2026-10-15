# Story page: Narration card shows the latest recording, re-narrate only when something changed

The Narrate card in the Story page's For narration view currently shows a "Narrate again" button all the time. Change it so it shows the latest recording, and offers to re-narrate only when the narration text or the narration settings differ from that recording.

**Reference:** `docs/design/app/NarrateCard.dc.html` and `NarrateCard.png`, which show the card in four states. Port px from the HTML source and ignore the board captions.

**Styling:**
- **Colours:** existing tokens by role only.
- **Buttons:** the app's existing play button and primary button.
- **Chevrons:** the app's standard chevron at its standard size.

---

## 1. Data

On each narration (the audio saved to the Library as a Story), store what it was made from:

```
narration {
  audioId, durationSec, createdAt,
  versionId,                    // the StoryVersion it was made from
  textHash,                     // hash of that version's full narration text
  settings: { voice, sound, pace, settleIn, fadeOut }
}
```

- **Current narration text:** the latest StoryVersion's narration text, including any edits the user made in the For narration view. Hash it the same way as `textHash`.
- **States:**
  - `textChanged` = the current text hash ≠ the latest narration's `textHash`;
  - `settingsChanged` = the current settings ≠ the latest narration's `settings`.

## 2. Card states

- **Card title:** "**Narrate**" in state 1, and "**Narration**" from state 2 onwards (10px caps, as now).
- **Container:** unchanged: card surface, padding 18px, a 4px gap.

### State 1: never narrated
Unchanged from the current card: the voice, sound and pace rows, the "Settle in first" and "Fade out at the end" switches, the primary "**Narrate · about {n} min**" button, and "Saved to Library as a Story".

### State 2: narrated, nothing changed (`!textChanged && !settingsChanged`)

**1. Recording block**
- **Container:** radius **14px**, padding **12px**, accent-tint background, 1px light-accent border. It's a row with a **12px** gap.
- **Contents:**
  - a **44px** play button;
  - a column with a 5px gap:
    - "{FirstName}'s story" in serif 16px;
    - "Narrated {date} · {minutes} min" in 12px muted;
    - a small static waveform (3px bars, 20px tall). Accent bars show the played part, light-accent bars the rest.
- **Playback:** the play button plays this recording in the app's player, the same as playing it from the Library.

**2. Collapsed settings row**
- 1px top border, padding **10px 0**, 13px body text.
- Contents: the voice avatar, then "{voice} · {sound} · {pace}", then "**Change**" with a chevron (13px, 600, label colour) on the right.
- **Change** expands the full settings rows and switches in place (the state 1 rows).

**3. Status line**
- A check icon in the accent colour, then "Up to date with your narration text" in 12px muted.
- There's **no Narrate button** in this state.

### State 3: settings changed (`settingsChanged && !textChanged`)
- **Recording block:** as in state 2.
- **Settings:** the full settings rows, expanded.
- **Note:** under the settings, "{Voice / Sound / Pace / Settings} changed since this narration" in 12px, label colour. Name the setting that changed, or say "Settings" if more than one did.
- **Button:** the primary "**Narrate again · about {n} min**".
- **Undoing:** if the user puts the settings back to match the recording, return to state 2.

### State 4: narration text changed (`textChanged`, whether or not settings changed)

**1. Recording block, marked as previous**
- **Container:** a muted surface (the progress-track colour at about 50%) with a 1px card-border border.
- **Badge:** above the title, "**Previous version**" (11px, 600, body colour, on the progress-track pill, padding 2px 8px).
- **Meta line:** "Narrated {date} · before your latest edits".
- **Playback:** it still plays.

**2. Note box**
- Accent tint, 1px light-accent border, radius 12px, padding **10px 12px**, a row with a 10px gap.
- Contents: a refresh icon in label colour, then "Your narration text has changed since this was recorded." in 13px.

**3. Collapsed settings row**, as in state 2, with Change expanding it.

**4. Button and footer**
- The primary "**Narrate again · about {n} min**".
- Under it, "The previous version stays in Versions" in 12px muted, centred.

## 3. After narrating again

- **Saving:** save the new narration as the latest, with its own `versionId`, `textHash` and `settings`.
- **The card:** goes to state 2 with the new recording.
- **Earlier recordings:**
  - they stay listed in the Versions card and playable from there;
  - the Library keeps one Story item, which always plays the latest narration;
  - the listen count and streak carry over.

## 4. Elsewhere

- **The Story page header's "✓ Ready to narrate":** show it only in states 1 and 3. In state 4 the header already shows "Update narration text" or the out-of-date dot. In state 2 show "✓ Narrated" instead.
- **Narrating with draft changes:** the "Narrate anyway / Update first" confirm still applies when the draft has changes the narration text doesn't have yet.

## Don't change

- The Every night and Versions cards (apart from listing narrations).
- The Library item.
- Narration generation.
