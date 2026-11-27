/**
 * Read default texts from the repo working tree (deploy seed / generator only).
 * Lambdas must NOT call this at runtime — use preprompt-defaults-data.ts.
 */
import fs from "node:fs";
import path from "node:path";
import {
  normalizePrepromptText,
  type PrepromptRegistryEntry,
} from "./preprompt-registry";

/** backend/lambdas/_shared */
const SHARED_ROOT = path.resolve(__dirname, "..");

export function repoPrepromptAbsolutePath(
  entry: Pick<PrepromptRegistryEntry, "repoRelativePath">,
): string {
  return path.join(SHARED_ROOT, entry.repoRelativePath);
}

export function readRepoPrepromptText(
  entry: Pick<PrepromptRegistryEntry, "repoRelativePath">,
): string {
  const abs = repoPrepromptAbsolutePath(entry);
  return normalizePrepromptText(fs.readFileSync(abs, "utf8"));
}
