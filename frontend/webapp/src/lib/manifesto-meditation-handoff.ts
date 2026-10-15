/**
 * "Meditate on this" for the Manifesto: opens Create with the manifesto
 * statement as the Start brief and the manifesto attached as context.
 */

import { createOneFlowHref } from "@/lib/create-one-flow-state";
import {
  MANIFESTO_CONTEXT_ID,
  writeGuidePracticeBrief,
} from "@/lib/guide-practice-handoff";

export type ManifestoMeditationInput = {
  statement: string;
  values?: readonly string[];
  lifeAreaTitles?: readonly string[];
  /** Overrides the brief (guides pass their `practiceBrief`); defaults to the statement. */
  brief?: string;
};

function contextBody(input: ManifestoMeditationInput): string {
  const lines: string[] = [];
  const statement = input.statement.trim();
  if (statement) lines.push(`Manifesto statement: ${statement}`);
  const values = (input.values ?? []).map((v) => v.trim()).filter(Boolean);
  if (values.length) lines.push(`Values: ${values.join(", ")}`);
  const areas = (input.lifeAreaTitles ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  if (areas.length) lines.push(`Life areas: ${areas.join(", ")}`);
  return lines.join("\n");
}

/** Writes the handoff and returns the Create href to navigate to. */
export function writeManifestoMeditationHandoff(
  input: ManifestoMeditationInput,
): string {
  const statement = input.statement.trim();
  const brief = input.brief?.trim() || statement;
  const body = contextBody(input);
  if (brief) {
    writeGuidePracticeBrief(
      brief,
      body
        ? { id: MANIFESTO_CONTEXT_ID, title: "My manifesto", bodyPlain: body }
        : null,
    );
  }
  return createOneFlowHref("start");
}
