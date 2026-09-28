/**
 * Run: npx tsx --test backend/lambdas/_shared/insight-sources.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findQuoteInEntry,
  normalizeForQuoteMatch,
  verifyInsightSource,
  verifyInsightSources,
} from "./insight-sources.ts";

describe("quote verification", () => {
  const entryText =
    "I finished the EP in the car park and felt that shift from 'maybe' to real.";

  it("matches with curly quotes and case", () => {
    const hit = findQuoteInEntry(
      entryText,
      "shift from \u201Cmaybe\u201D to real",
    );
    assert.ok(hit);
    assert.match(normalizeForQuoteMatch(hit!), /maybe/);
  });

  it("drops invented quotes but keeps valid entry id", () => {
    const map = new Map([["e1", entryText]]);
    const ref = verifyInsightSource(
      { entryId: "e1", quote: "I invented this entirely" },
      map,
    );
    assert.deepEqual(ref, { entryId: "e1" });
  });

  it("drops foreign entry ids", () => {
    const map = new Map([["e1", entryText]]);
    assert.equal(
      verifyInsightSource({ entryId: "other", quote: "finished the EP" }, map),
      null,
    );
  });

  it("keeps verified quote", () => {
    const map = new Map([["e1", entryText]]);
    const refs = verifyInsightSources(
      [{ entryId: "e1", quote: "finished the EP in the car park" }],
      map,
    );
    assert.ok(refs?.[0]?.quote);
    assert.equal(refs![0]!.entryId, "e1");
  });
});
