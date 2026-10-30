/**
 * Story narration script builder.
 *
 * Spoken title + pause is applied by the generate worker
 * (`withSpokenMeditationTitleIntro`) — do not prepend a meditation settle-in.
 */

/** @deprecated Kept for older stored prefs; never prepended to TTS anymore. */
export const STORY_SETTLE_IN_SCRIPT = [
  "Before the story, settle in.",
  "Find a comfortable position. Let your shoulders drop. Soften your jaw.",
  "Take a slow breath in through the nose… and a longer breath out through the mouth.",
  "Again. In… and out.",
  "One more. In… and let it go.",
  "There’s nothing to fix right now. Nowhere to get to. Just this body, this breath, this evening.",
  "Feel the weight of you where you rest. Notice the air on your skin. The quiet around you, even if the room isn’t silent.",
  "If thoughts arrive, let them pass like weather. You don’t need to follow them.",
  "Breath in… breath out. Easy. Unhurried.",
  "In a moment you’ll hear a story of your life, already true. Listen as if you’re remembering.",
  "When you’re ready, the story begins.",
].join("\n\n");

/**
 * Body sent to TTS for a Story narration.
 * Title (sentence-case + period) and the break before the body are added by
 * the audio worker — pass only the third-person narration here.
 */
export function buildStoryNarrationScript(opts: {
  thirdPersonText: string;
  /** Ignored — settle-in intros are not used for stories. */
  settleInFirst?: boolean;
}): string {
  return opts.thirdPersonText.trim();
}
