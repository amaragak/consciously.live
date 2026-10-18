import { streamPlanCoachReply } from "@/lib/plan-claude";

/** Short noun phrases for the dream poster. At most 4, at most 3 words each. */
export async function suggestObstacleLabels(text: string): Promise<string[]> {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const raw = await streamPlanCoachReply(
    [
      {
        role: "user",
        content: [
          "Turn the obstacles below into short noun phrases for chips titled “In the way”.",
          "At most 4 phrases. At most 3 words each. No sentences, no commas inside a phrase.",
          "Return ONLY a JSON array of strings.",
          "",
          trimmed.slice(0, 1200),
        ].join("\n"),
      },
    ],
    () => {},
  );
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.replace(/[*_#]/g, "").trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+/).slice(0, 3).join(" "))
    .slice(0, 4);
}
