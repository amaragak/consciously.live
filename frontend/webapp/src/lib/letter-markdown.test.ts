/**
 * Run: npx tsx --test frontend/webapp/src/lib/letter-markdown.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { frameLetterMarkdown } from "./letter-markdown.ts";

describe("frameLetterMarkdown", () => {
  it("adds preamble and closing when greeting jumps to headers", () => {
    const md = frameLetterMarkdown(`Dear Alex,

### What stood out
You finished your EP. Sitting in that car park felt like a turning point.

### Carry forward
That quiet version of you is more present. Trust that momentum into the release.`);
    assert.match(md, /You finished your EP\./);
    assert.match(md, /### What stood out\nSitting in that car park/);
    assert.match(md, /Trust that momentum into the release\./);
    assert.match(
      md,
      /### Carry forward\nThat quiet version of you is more present\./,
    );
    const pre = md.indexOf("You finished your EP.");
    const h = md.indexOf("### What stood out");
    assert.ok(pre < h);
  });
});
