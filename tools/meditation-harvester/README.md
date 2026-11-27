# Meditation harvester

Standalone local Python tool (not part of the Consciously app runtime, build or deploy). Lives in the repo at `tools/meditation-harvester/` so its outputs can be imported by admin; the app never imports this package.

Searches YouTube with your terms. Haiku reads each result's title and description and keeps only real guided meditations, so interviews, talks, podcasts and music-only videos get dropped. The tool then pulls the audio, transcribes it locally with pause timings, has Haiku confirm the type from what the transcript actually does, and has Sonnet turn each type's transcripts into generation instructions for the Consciously script generator. A **skeletons** step turns every transcript into a text-free skeleton (passages and pauses with roles and phases) and aggregates per-style pacing profiles. A **fingerprint** step learns how each style is *delivered* (usual openings and closings, delivery strength, voice, phrasing that fits or doesn't), compared against the other styles, and feeds that into synthesis. One import bundle for the app's admin carries it all.

See `HARVESTER_OVERVIEW.md` for a fuller pipeline summary.

## Setup (once)

```
cd tools/meditation-harvester
./install.sh
```

This installs uv, Python 3.12 and everything else into a local `.venv`, then asks for your Anthropic API key and saves it to `.env`.

## Quick start

```
./run.sh all                                              # default query per type, then everything
./run.sh all "joe dispenza meditation" --type manifestation   # your terms, then everything for that type
```

## Collect videos

```
./run.sh search "joe dispenza meditation" "morning manifestation meditation" --type manifestation
./run.sh search "yoga nidra" --type sleep --limit 5
./run.sh search "joe dispenza meditation" --type visualization,manifestation   # point at several; transcript picks
./run.sh search "guided meditation"                 # no type: Haiku suggests one
./run.sh search --defaults                          # one default query per type, from types.json
./run.sh add https://www.youtube.com/watch?v=XXXXXXXXXXX --type body-scan
./run.sh list                                       # what's kept, with given vs suggested types
./run.sh list --all                                 # include rejected, with reasons in videos.json
```

Each search term keeps up to `--limit` vetted videos (default 8), most viewed first, with at most 2 per channel. The output marks each result:
- `✓` kept
- `✗` rejected, with Haiku's reason
- `-` passed but over the limit
- `=` already collected

Videos you add with `add` are always kept, even when Haiku doubts them. To drop one, set `"excluded": true` on it in `data/videos.json`.

## Process

```
./run.sh process                       # download → transcribe → classify → skeletons → fingerprint → synthesise
./run.sh process --types manifestation,sleep
```

Or run the steps one at a time: `download`, `transcribe`, `classify`, `skeletons`, `fingerprint`, `synthesise`. Every step skips work that's already done. Use `--force` to redo it.

## Skeletons and pacing

```
./run.sh skeletons                     # every active, classified video with a transcript
./run.sh skeletons --types sleep       # only videos used for that style (primary or secondary)
./run.sh skeletons --force             # rebuild skeletons and pay for the Haiku labels again
```

Runs automatically at the end of `process` and `all`. No transcription or audio download is involved.

A **skeleton** is the session as an ordered list of segments:
- **passages**: spoken runs. Silences under 4 s (`skeleton_pause_seconds`) stay inside the passage; those of 1 s or more (`pause_threshold_seconds`) are recorded as the passage's short pauses (count and lengths). Each passage has start, length, word count, position (start as a fraction of the runtime), a **role** and a **phase**.
- **pauses**: silences of 4 s or more at their measured length, including before the first words and after the last. Shorter silence before the first words or after the last is kept as `lead_in_s` / `tail_s`, so lead-in + segments + tail equals the runtime (`timing_check` records the gap, and the gap to YouTube's duration).

Roles: settle, breath, body, imagery, affirmation, reflection prompt, instruction, story, self-practice handover, return, close, other. Phases: opening, main, closing (they only move forward).

One Haiku call per video (`vetting_model`, `parallel_llm_calls` in parallel) gets the passages in order, each with a trimmed excerpt, and returns role and phase per number. The labels are cached in `data/skeleton_labels/<id>.json`, so re-runs don't pay twice (`--force` relabels). If a call fails the video is skipped and retried next run. **No transcript text is written to any skeleton or export.**

Per video the skeleton export also carries id, title, channel, views, likes, runtime, final style and whether the style was a `primary` or `secondary` fit. Likes come from yt-dlp; new videos store them when fetched, and the step backfills older ones from metadata alone (no audio). Videos yt-dlp can't read stay unchecked and are retried next run.

The step ends with a summary: skeletons per style, videos skipped and why, and an estimated Haiku cost (`haiku_price_per_mtok` in `config.json`).

`./run.sh list` ends each video's line with `skeleton:Np/Nz` (passages/pauses), or `-` if it has none.

**Pacing profiles** (`output/pacing.json`) aggregate each style's skeletons. Primary fits weigh 1 and secondary fits `secondary_weight` (0.5), the same primary-over-secondary idea as synthesis. Per style:
- runtime: median, spread and range
- speech share (time inside passages / runtime), overall and by tenth of the session
- pause length median and spread by tenth, with pauses per session
- passage word count by tenth and by role
- passages per minute
- share of each role, by passage count and by speech time
- opening and closing phase length as a fraction of the runtime
- self-practice silences: pauses longer than 30 s, with count and lengths

## Delivery fingerprints

```
./run.sh fingerprint                   # every active, classified video with a transcript
./run.sh fingerprint --types sleep     # annotate and group phrases only for that style (output still covers every style on disk)
./run.sh fingerprint --force           # redo the Haiku annotations and phrase grouping (costs again)
```

Runs in `process` and `all` after `skeletons` and before `synthesise`, so synthesis can use it. Skips work already done: annotations are cached per video and phrase groupings per style, so a re-run with nothing new costs nothing. It needs no audio or transcription.

**1. Annotation (one Haiku call per video, cached in `data/fingerprint_annotations/<id>.json`).** From the transcript, as JSON from fixed taxonomies:
- opening moves, in order: welcome, posture, eyes closed or soft gaze, settling breaths, body arrival, intention or purpose, permission or acceptance, overview, other
- closing moves, in order: deepen once more, return attention, movement, eyes open, gratitude, carry into day, affirmation or intention restated, other
- techniques: breath counting or ratio, body-part sequence (with direction), imagery journey, future-self scene, repeated affirmations, reflection questions, noting or labelling, loving-kindness phrases, movement cues, story narration, other
- imagery themes: nature, water, light, home, future success, people, other
- voice: person (you / we / I / mixed), whether the listener gets "I" statements, main tense (present / future / as if already true / mixed), how much it asks questions (none to high)
- delivery, 1-5: directiveness (permissive to assertive), energy (soothing to energising), certainty about outcomes, warmth, formality
- repetition level, and whether the listener is invited to repeat lines

Code adds the question marks per 1,000 words. The cache is keyed by model and `FP_VERSION` (bump it in `harvester.py` after changing the annotation prompt or taxonomy). Thinking is switched off for these calls, since they are classification.

**2. Phrase families.**
- *Counting, in code.* Recurring 3-7 word phrases are counted across all transcripts. A phrase must occur in at least 3 videos from at least 3 channels, with no single channel supplying more than half of them, which drops names, brands and channel sign-offs (sign-off words and phrases starting or ending on filler words are also dropped). At most 5 occurrences per video count, so a looping affirmation can't dominate. Counts are normalised per 1,000 words, weighted primary 1 / secondary `secondary_weight`.
- *Grouping, one Haiku call per style (cached in `data/fingerprint_families/<style>.json`).* Each style's top 120 phrases (by rate, in at least 10% of its videos, shorter phrases inside longer ones pruned) go to Haiku, which groups the ones that mean the same thing into families and describes each in its own words with at most two example phrasings of six words or fewer. Families found for different styles that share phrases (40% of the smaller family) are merged into one.
- *Classification, per family and style, from its rate (occurrences per 1,000 words) and prevalence (share of the style's sessions using it).* Thresholds are in `FP_DEFAULTS` in `harvester.py`; override any under `"fingerprint"` in `config.json`.
  - **present**: rate >= 0.2 and prevalence >= 15%.
  - **marker**: present, and rate >= 2x its rate in the other styles' videos.
  - **generic**: present in at least 60% of the styles (and here), and not a marker. Overused; keep sparing.
  - **foreign**: rate <= 0.1 and prevalence <= 5% here, while some other style uses it at >= 0.4 per 1,000 words, and not generic.
  - **neutral**: the rest.

**3. Style fingerprint (code), written to `output/fingerprints.json` and `output/fingerprints.md`.** Per style, with primary fits weighing 1 and secondary fits `secondary_weight`: prevalence of each opening and closing move and their usual order (moves in at least 25% of sessions, ordered by average position); technique, imagery and body-direction prevalence; delivery medians, means and spread; person and tense mix, question rate; repetition pattern; the top marker, generic and foreign families (with the styles a foreign family belongs to, and `match_phrases` for scoring); and **how the style differs most from the other styles**: the five biggest differences across delivery ratings, moves and phrasing, each stated plainly. `fingerprints.md` also has a cross-style comparison table.

**4. Synthesis.** `synthesise` gives each style's fingerprint to its Sonnet call, and every guide gains a short **What listeners expect** section: the standard opening and closing (with how common they are), the expected delivery strength and voice, phrasing that fits, phrasing to keep rare, and phrasing to avoid with the style it belongs to. The existing rules stay: guides are defaults, the user's request overrides them, never more than six consecutive words from a source, no teacher or channel names. Without a fingerprint, `synthesise` writes the guide as before. After writing guides, `synthesise` refreshes `output/consciously-import.json` so the bundle carries the new guides.

The step ends with a summary: annotations done, families found, and the Haiku cost (about $1.3 for a full first run over ~250 videos; later runs cost nothing unless videos are new).

## How types are assigned

`--type` is a pointer, not the final answer. Give one type or several, comma-separated. After transcription, `classify` reads the transcript and picks the best match among the types you gave. If none of your types fit, the transcript's own top type is used and `list` marks the video with `*`. In `list`, `->` shows the type each video will be used for.



Each video keeps three type signals:
- **given**: the `--type` you searched or added it with
- **meta**: Haiku's suggestion from the title and description, at search time
- **transcript**: Haiku's suggestion from the transcript, in the `classify` step. Up to three, best first.

A video goes into the instructions for its given type (or the meta suggestion if you gave none). With `synthesis_includes_machine_types: true` it also goes into the transcript's top suggested type, tagged as such so Sonnet weights it correctly. `list` puts a `*` on videos where the transcript disagrees with your type. If `classify` finds a video isn't a guided meditation after all, the video is dropped from synthesis.

## Outputs

- `output/instructions/<type>.md`: the pre-prompt to pass into Consciously when that style is selected. It contains the prompt only.
- `output/instructions.json`: all types in one file, as `{ "body-scan": { "label": "...", "instructions": "..." } }`.
- `output/analysis/<type>.md`: notes for you. What the sources share, where they differ, aggregate stats, and the source list with how each source was assigned.
- `output/skeletons.json`: all skeletons grouped by style (`{ "sleep": [ { id, title, channel, views, likes, runtime_s, style, fit, segments: [...] } ] }`). Videos used for a second style appear there too, with `fit: "secondary"`. Always rebuilt from every skeleton on disk, whatever `--types` you ran.
- `output/pacing.json`: the per-style pacing profiles.
- `output/fingerprints.json`, `output/fingerprints.md`: the per-style delivery fingerprints (see above). The `.md` is the one to read.
- `output/consciously-import.json`: the one file the app's admin uploads. `schema`, `version` (`generated_at`, 12-character content `hash`, and `id` combining both), `style_guides` (the 12 guides from `instructions.json`), `pacing`, `skeletons` and `fingerprints` (each style's fingerprint, with family descriptions, short example phrasings and the short recurring phrases used to match them; no transcript text). The hash covers the content only, so unchanged content keeps the same hash (and the old stamp). Not written until at least one skeleton exists.
- `data/skeletons/<id>.json`, `data/skeleton_labels/<id>.json`: per-video skeleton and cached Haiku labels (no transcript text in either).
- `data/fingerprint_annotations/<id>.json`, `data/fingerprint_families/<style>.json`: cached Haiku annotations and phrase families (no transcript text).
- `data/transcripts/<id>.md`: `[mm:ss]` at each spoken passage and `[pause Ns]` with the measured length of every silence of 1s or longer (one decimal under 10s), with pacing stats at the top (wpm, silence %, pause distribution, silence by tenth of runtime).
- `data/audio/<id>.m4a`: the audio.

## Settings (`config.json`)

- `pause_marker`: the pause syntax the instructions tell the writer to use. It defaults to `[[PAUSE {s}s]]`, with N in seconds (e.g. `[[PAUSE 1.5s]]`, `[[PAUSE 12s]]`). Set it to whatever the generator parses before you synthesise.
- `vetting_model`: Haiku, used for search vetting, transcript classification, skeleton labelling and delivery fingerprints.
- `fingerprint` (optional): overrides for the phrase and classification thresholds listed under Delivery fingerprints.
- `skeleton_pause_seconds` (4), `secondary_weight` (0.5), `haiku_price_per_mtok` (input/output USD, for the cost estimate only).
- `synthesis_model` / `target_generator_model`: Sonnet.
- `whisper_model`: `small.en`. `medium.en` is more accurate but about 2–3× slower.
- `results_per_query`, `max_per_channel_per_query`, `min_duration_minutes`, `max_duration_minutes`: search filters.

## Notes

- Transcription runs on your Mac's CPU, roughly 3–6 min per hour of audio with `small.en`.
- Pauses are measured from the gaps between spoken words, so background music doesn't hide them. `pause_threshold_seconds` (1s) is the shortest gap counted; normal breaths between phrases are under that.
- The instructions include a table of pause lengths by kind of moment (after a cue, after a question, inside imagery, between phases, final silence), taken from the measured pauses, so the generator writes each pause at the length the videos use for that moment.
- The guides' *What listeners expect* section comes from the fingerprint; if you change the annotation prompt, bump `FP_VERSION`, run `./run.sh fingerprint`, read `output/fingerprints.md`, then `./run.sh synthesise --force`.
- Sonnet is told never to copy more than six words in a row from a source and never to name teachers or channels.
- If YouTube starts failing, run `./install.sh` again to update yt-dlp.
