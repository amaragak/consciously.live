/**
 * Raise-the-ceiling levels must not share one rewrite.
 * Run: npx tsx --test frontend/webapp/src/lib/raise-levels.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blankCopiedRaiseLevels,
  offlineRaiseLevelSets,
  suggestionsDiffer,
} from "./raise-levels.ts";

describe("raise levels", () => {
  it("returns a different suggestion set for each level of the same input", () => {
    const sets = offlineRaiseLevelSets("I think I will play music someday");
    assert.ok(sets.ambitious.length > 0);
    assert.notDeepEqual(sets.ambitious, sets.audacious);
    assert.notDeepEqual(sets.audacious, sets.delusional);
    assert.notDeepEqual(sets.ambitious, sets.delusional);
    for (let i = 0; i < sets.ambitious.length; i += 1) {
      const row = {
        ambitious: sets.ambitious[i] ?? "",
        audacious: sets.audacious[i] ?? "",
        delusional: sets.delusional[i] ?? "",
      };
      assert.equal(suggestionsDiffer(row), true);
    }
  });

  it("keeps a deletion the same on every level and blanks copied rewrites", () => {
    const deletion = blankCopiedRaiseLevels({
      ambitious: "",
      audacious: "",
      delusional: "",
    });
    assert.deepEqual(deletion, { ambitious: "", audacious: "", delusional: "" });
    assert.equal(suggestionsDiffer(deletion), true);

    const copied = blankCopiedRaiseLevels({
      ambitious: "I play",
      audacious: "I play",
      delusional: "I play",
    });
    assert.deepEqual(copied, { ambitious: "I play", audacious: "", delusional: "" });
    assert.equal(suggestionsDiffer(copied), false);
  });
});
