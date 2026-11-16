# Script generation · cost-cut pre-prompt comparison

Tracks the condensation from `consciously-script-cost-cut.zip`. Every distinct rule from the previous production prompt is listed with where it lives now.

Token estimates use ≈ chars/4 (rough). Live per-call counts (input / cache-write / cache-read / output) are logged as `tag: "script-gen-usage"` on plan, section, fix, and single-call paths after deploy.

## Structural changes (not wording)

| Change | Before | After |
| --- | --- | --- |
| Cache layout | One ephemeral system block | **5m** systemStable (rules + delivery + style guide) + **5m** meditationContext (+ plan for sections); task uncached. (Was 1h system — switched to 5m; within-job reuse only needs minutes.) |
| Personalization / gender | In **system and user** (duplicate) | **systemStable only** |
| Delivery block | In user task | **systemStable** (same for plan + sections) |
| Pause syntax (model-facing) | `[[PAUSE short]]` etc. | `<s>`, `<m>`, `<l>`, `<xl>`, `<xs>`, `<o>`, timed `<2.5>` — expanded to `[[PAUSE …]]` immediately after generation |
| Section / fix effort | Default Sonnet effort (`high`) | `output_config.effort: "low"` + existing `thinking: between_tools` |
| Plan / single-call effort | Default | Unchanged (no `effortLow`) |
| Haiku (style infer) | Thinking off | Unchanged |

## Token / cost narrative (estimate)

### Pre-prompt (input)

| Piece | Before (approx) | After (approx) | Notes |
| --- | --- | --- | --- |
| Pause rules block | ~970 tok | ~650 tok | Merged overlapping sentences; short markers |
| Personalization + gender second copy | ~720 tok | **0** (section keeps short section-personalization in task) | Removed full duplicate from user |
| System intro fluff | ~120 tok | ~70 tok | Same constraints, tighter |
| **Stable system (no guide)** | ~1.6–2.0k | ~1.2–1.5k | Before guide markdown |
| Style guide | unchanged | unchanged | Harvester will replace later |

### Output pauses

| Length | Markers (typical) | Before (~8 tok each) | After (~2–3 tok) | Saved |
| --- | --- | --- | --- | --- |
| 5 min | ~25 | ~200 | ~60 | ~140 |
| 10 min | ~50 | ~400 | ~125 | ~275 |
| 20 min | ~100 | ~800 | ~250 | ~550 |

### Effort + thinking

- Before: Sonnet 5.5 default effort `high` on section writes; `between_tools` already suppressed up-front thinking. Adaptive thinking tokens were **not** separately billed in older logs (they fold into `output_tokens` when present). Expect **near-zero thinking tokens** on section/fix at `effort: low` + `between_tools`.
- After: section/fix set `effort: low`. Plan/single keep default. Check CloudWatch `script-gen-usage` lines for `output_tokens` drop on section calls.

### Cost per meditation (Sonnet 5.5 list: $2/MTok in, $10/MTok out; cache read 0.1×, 5m write 1.25×, 1h write 2×)

Rough **first** meditation (cold caches), guided, sections path, no style-guide change:

| Length | Before (ballpark USD) | After cold (ballpark) | After warm same delivery+style (2nd+) |
| --- | --- | --- | --- |
| 5 min | ~$0.08–0.12 | ~$0.06–0.10 | ~$0.04–0.07 (1h system hits) |
| 10 min | ~$0.15–0.25 | ~$0.11–0.18 | ~$0.08–0.14 |
| 20 min | ~$0.30–0.50 | ~$0.22–0.35 | ~$0.15–0.28 |

Warm savings grow when checkpoint 1 is read across users and checkpoint 2 is read across parallel section calls after the plan write. Exact numbers come from `script-gen-usage` logs (`usd`, `cache_*` fields).

## Rule inventory

### Role / safety / product

| Rule | New location |
| --- | --- |
| Expert meditation scriptwriter; speakable scripts | `systemStable` intro |
| No self-referential product mentions; `consciously.live` if needed | `systemStable` |
| Playful subject OK; practice stays calming (no comedy bits) | `systemStable` |
| Refuse hate / CSAM / non-consensual / graphic sexual / wrongdoing / self-harm glorification; offer safe alt | `systemStable` |
| Natural TTS phrasing (no isolated one-word sentences) | `systemStable` (+ brief reminder removed from task; same meaning) |

### Personalization

| Rule | New location |
| --- | --- |
| Concrete User/brief/journal facts must appear; do not abstract | `systemStable` (`PERSONALIZATION_KEEP_RULES`) |
| Keep place names, companions, events, body specifics | same |
| Forbidden substitutions (“a trip”, “someone close”, …) | same |
| Named sensory detail: invent fitting specifics if asked | same |
| ≥3 touchpoints (open / mid / close) | same (whole-script; section task still uses plan `details`) |
| Prefer User/brief over Guide paraphrase; whimsy OK | same |
| Section: use plan-assigned details | section `taskContent` (`scriptSectionWriteInstruction`) |
| *(Removed)* second full copy in user task | — |

### Gender

| Rule | New location |
| --- | --- |
| Gender-neutral unless creator specified | `systemStable` (`GENDER_NEUTRAL_SCRIPT_RULES`) |
| Forbidden pronouns/labels unless user said them | same |
| KEEP kinship / named gendered people | same |
| Address as you; they/them for ungendered third person | same |
| Bad/good example (future self) | same |
| Keep user’s she/he for that person; don’t extend | same |
| *(Removed)* second full copy in user task | — |

### Delivery

| Rule | New location |
| --- | --- |
| Casual / Guided / Open sits block (full meaning) | `systemStable` (`DELIVERY_PROMPT_BLOCKS`) |
| Delivery pauseRules (longest pause, stitch note) | `systemStable` (short markers) |
| Section delivery variant | superseded by full block in systemStable (same intent; no length numbers needed for sections) |

### Length / pacing

| Rule | New location |
| --- | --- |
| Length paragraph (WPM, silence %, words, pause seconds) | `meditationContext` |
| Plan speech+silence to land near N minutes | `meditationContext` |
| Longer-breaks / Story / scale-pause density notes | `meditationContext` |
| Spoken budget / duration appendix (legacy paths) | `taskContent` when `!fitPrompt` |

### Pauses

| Rule | New location |
| --- | --- |
| Liberal short markers; named bands preferred | `systemStable` (`SCRIPT_PAUSE_PROMPT_RULES`) |
| Often; every transition; intelligent placement | same |
| Band choice (s/m/l/xl) by context | same |
| Guided breath cycles → s/xs only | same |
| Own-time → xl; don’t stack gratuitously | same |
| Marker placement (after sentence, don’t split words) | same |
| Explicit spoken timings only if user asks | same |
| Forbidden count recipes unless asked | same |
| Still craft silence; gate announcing timings | same |
| Counted timing → real seconds; band map; timed `<1>` | same |
| Pause fits action | `systemStable` (`PAUSE_FITS_ACTION_RULE`) |
| Open sits long silence markers | `systemStable` when open_sits |
| Longer-breaks open practice budget | `taskContent` (legacy) / `meditationContext` cue |
| Style-guide pause examples | rewritten to short form on load (`rewriteGuidePauseMarkers`) |

### Plan / section tasks

| Rule | New location |
| --- | --- |
| Plan JSON shape, word caps, min sections | `taskContent` (`scriptPlanTaskInstruction`) |
| Write only named section; word/pause targets; own-silence edges | `taskContent` (`scriptSectionWriteInstruction`) |
| Full plan JSON | `meditationContextExtra` (5m cache) |
| Prior text (sequential) | `taskContent` |
| Match tone; second person; formatting constraints (no title, no leading pause) | `taskContent` |
| Output only spoken words + short pause markers | `taskContent` |

### Style guide

| Rule | New location |
| --- | --- |
| Precedence: brief/chat → length/silence rules → guide | `systemStable` guide block |
| Delivery pacing preamble | same |
| Guide markdown | same (condensed files later from harvester) |

### Script Lab–only (unchanged meaning)

| Rule | New location |
| --- | --- |
| Structured beats, personalization wins, tag rules, sleep close, pause beats | `taskContent` when `includeSegmentPlaceholders` |
| Inline pauses in custom beats → short form in examples | same |

## Check list

- [x] Section/fix: `effort: low`
- [x] Plan/single: default effort
- [x] Dual cache breakpoints (1h / 5m)
- [x] Short pause markers + expand after generation
- [x] Duplicate personalization/gender removed from task
- [x] Usage logging with cache + usd
- [ ] Live cost before/after from CloudWatch after deploy-back
- [ ] Confirm 2nd meditation same delivery+style shows cache_read on checkpoint 1
