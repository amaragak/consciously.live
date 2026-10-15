/**
 * Fixed ~2 min breathing intro prepended when “Settle in first” is on.
 * ~280 words at ~140 wpm.
 */

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

/** Build the script sent to TTS for a Manifesto Story narration. */
export function buildStoryNarrationScript(opts: {
  thirdPersonText: string;
  settleInFirst: boolean;
}): string {
  const body = opts.thirdPersonText.trim();
  if (!body) return "";
  if (!opts.settleInFirst) return body;
  return `${STORY_SETTLE_IN_SCRIPT}\n\n${body}`;
}
