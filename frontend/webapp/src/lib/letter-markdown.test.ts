/**
 * Run: npx tsx --test frontend/webapp/src/lib/letter-markdown.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceLetterMarkdown,
  frameLetterMarkdown,
} from "./letter-markdown.ts";

describe("coerceLetterMarkdown", () => {
  it("converts bodyParts JSON into readable markdown", () => {
    const md = coerceLetterMarkdown(
      JSON.stringify({
        greeting: "Dear [[NAME]],",
        preamble: "This week you finished something real.",
        sections: [
          {
            heading: "The work is done",
            bodyParts: [
              { text: "On Thursday you finished the last take. " },
              { text: "That mattered." },
            ],
          },
        ],
        closing: "Keep going.",
      }),
    );
    assert.match(md, /^Dear \[\[NAME\]\],/);
    assert.match(md, /### The work is done\nOn Thursday you finished/);
    assert.doesNotMatch(md, /bodyParts|"greeting"/);
  });

  it("recovers when raw JSON was stored after a greeting line", () => {
    const json = JSON.stringify({
      greeting: "Dear Alex,",
      preamble: "A warm open.",
      sections: [
        {
          heading: "What stood out",
          bodyParts: [{ text: "You showed up anyway." }],
        },
      ],
      closing: "Take care,",
    });
    const md = coerceLetterMarkdown(`Dear Alex,\n\n${json}`);
    assert.match(md, /### What stood out\nYou showed up anyway\./);
    assert.doesNotMatch(md, /\{|"sections"/);
  });
});

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
