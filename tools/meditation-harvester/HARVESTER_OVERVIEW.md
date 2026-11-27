# Meditation harvester: overview

A local Python tool on Alex's Mac (`~/meditation-harvester`). It studies popular guided meditations on YouTube and turns them into one style guide per Consciously Meditate style. Those guides are passed to the script generator when a style is selected. It now lives in the Consciously repo at `tools/meditation-harvester/` so its output can be imported by admin, but it is still a standalone tool: the app never imports it. Until now only its output (the 12 style guides) went into the app, via Cursor prompt zips; `output/consciously-import.json` is the new single-file hand-off (guides, pacing, skeletons).

## Pipeline (`./run.sh <step>`)

1. **search** — searches YouTube with given terms and an optional `--type` hint (one or several styles, e.g. `--type visualization,manifestation`). Claude Haiku reads each result's title and description and keeps only real guided meditations (rejecting interviews, talks, podcasts and music-only). Results are kept most-viewed first, with at most 2 per channel. Stored in `data/videos.json`.
2. **download** — uses yt-dlp to download audio to `data/audio/`.
3. **transcribe** — runs faster-whisper locally, with word timings. Every silence of 1s or more is written inline as `[pause Ns]` at its measured length. Pause stats are computed per video: typical and longest pause, overall and by tenth of the session, and silence before the first words.
4. **classify** — Haiku reads each transcript, confirms it is a guided meditation and ranks the styles it fits. The final style is the transcript's best match among the hinted types, or its own top pick if none of them fit.
5. **synthesise** — for each style, Claude Sonnet reads all of that style's transcripts plus pause stats and writes:
   - `output/instructions/<style>.md`: the style guide, about 700–900 words;
   - `output/analysis/<style>.md`: developer notes and a source list.
   It also writes `output/instructions.json` with all 12 guides combined.

6. **skeletons** — for every active, classified video with a transcript, builds its **skeleton**: the session as passages (spoken runs; silences under 4s stay inside, kept as short pauses) and pauses (4s or more, including before the first and after the last words). Each passage has start, length, word count, position as a fraction of the runtime, a role (settle, breath, body, imagery, affirmation, reflection prompt, instruction, story, self-practice handover, return, close, other) and a phase (opening, main, closing). One Haiku call per video labels roles and phases from trimmed excerpts; labels are cached per video. No transcript text is exported. Per video it also records the metadata (id, title, channel, views, likes, runtime, final style, primary or secondary fit); likes come from yt-dlp and are backfilled for older videos without re-downloading audio. It then aggregates per-style **pacing profiles** (primary fits weighted over secondary, as in synthesis: runtime, speech share, pauses and passage length by tenth, passages per minute, role shares, opening and closing length, self-practice silences over 30s) and writes:
   - `output/skeletons.json`: all skeletons, grouped by style;
   - `output/pacing.json`: the per-style profiles;
   - `output/consciously-import.json`: the single file the app's admin uploads, with a version stamp (date/time plus content hash), the 12 style guides, the pacing profiles and the skeletons.

7. **fingerprint** — learns how each style is *delivered*, compared against the other styles. Runs after `skeletons` and before `synthesise`; skips work already done (`--force` redoes it).
   - One Haiku call per transcript (cached) extracts opening and closing moves in order, techniques, imagery themes, voice (person, tense, questions), delivery ratings 1–5 (directiveness, energy, certainty, warmth, formality) and the repetition pattern, from fixed taxonomies.
   - Code counts recurring 3–7 word phrases per style per 1,000 words (3+ videos, 3+ channels, capped per video, so names and sign-offs drop out); one Haiku call per style groups them into families; each family is classified per style as marker (much more common here), generic (common across most styles), foreign (belongs to other styles, rare here) or neutral, by documented thresholds.
   - Per style, primary fits weighted over secondary: move prevalence and usual order, technique prevalence, delivery medians and spread, person/tense mix, question rate, repetition, the top marker/generic/foreign families, and the five biggest differences from the other styles. Writes `output/fingerprints.json` and a readable `output/fingerprints.md` (one section per style plus a cross-style table), and adds the fingerprints to `output/consciously-import.json`.
   - `synthesise` gives each style its fingerprint, so every guide has a **What listeners expect** section: the standard opening and closing, expected delivery strength and voice, phrasing that fits, phrasing to keep rare, phrasing to avoid (with the style it belongs to).

Other commands: `all` (search then process), `process` (steps 2–7: download, transcribe, classify, skeletons, fingerprint, synthesise), `add <url>`, `list` (also shows each video's skeleton status). Every step skips work that is already done, and `--force` redoes it.

## The 12 styles

Body scan, Visualization, Breath-led, Manifestation, Affirmation loop, Story, Reflection, Sleep, Loving-kindness, Anxiety relief, Movement meditation, Open awareness. These are defined in `types.json`.

## What a style guide contains

The current synthesis prompt produces guides that teach how to write the style, not what a typical session contains. The user's request decides the content.

Each guide opens with:

> Guidance for <Style> meditations, not fixed rules. Use judgement for each moment; the user's request overrides any of this.

It then covers:
1. Mechanism.
2. Phases: how the style divides into sections for the plan-then-sections generator, how phases scale with length, what carries across sections, and how sections hand over.
3. How things are brought in and said.
4. Pauses: loose principles only, under `## Pauses`. Examples use `[[PAUSE Ns]]`.
5. Opening and closing.
6. Common mistakes.
7. A worked example.

There are no speaking-rate, WPM or word-budget figures, because the TTS voice sets the pace.

## Current state (as of 11 Nov 2026)

- 251 videos have been collected, transcribed and classified across the 12 styles. Story has the fewest sources (4), which is accepted because the style is more improvised.
- The latest guides are the condensed versions, applied to the app via `consciously-style-guides-condensed.zip`. Before that came `consciously-style-instructions-v5.zip`, `consciously-style-guides-pacing-v2.zip` and `consciously-script-cost-cut.zip`.
- Rules applied in the app:
  - The guide goes only into the cached prompt for the selected style.
  - Precedence: the user's request first, then the app's length and silence rules, then the guide.
  - Casual pacing drops the guide's Pauses section.
  - Open sits gets a pacing line, because its silences are much longer than in the guides.
- A published "Meditation Style Briefs" page shows all 12 guides with pause stats and sources.

## Config (`config.json`)

- Models: synthesis `claude-sonnet-5-5`, vetting and classification `claude-haiku-5-5`.
- Whisper model: `small.en`.
- Pause threshold: 1.0s.
- Pause marker: `[[PAUSE {s}s]]`.
- Per-style transcript budget: 500,000 characters.
- Skeletons: pause length that splits passages 4s (`skeleton_pause_seconds`), secondary-fit weight 0.5 (`secondary_weight`), Haiku prices for the cost estimate (`haiku_price_per_mtok`).
- Fingerprints: thresholds live in `FP_DEFAULTS` in `harvester.py` (override under `"fingerprint"` in `config.json`); bump `FP_VERSION` after changing the annotation prompt.

Synthesis (the style guides) is unchanged by the skeleton step, and gains its *What listeners expect* section from the fingerprint step. To change what the guides say, edit the `SYSTEM` and `TASK` prompts in `harvester.py`, then run `./run.sh synthesise --force`. That takes about 10 minutes and needs no re-transcription.
