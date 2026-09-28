/**
 * Run: npx tsx --test backend/lambdas/_shared/letter-markdown.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceLetterMarkdown,
  ensureLetterBodyHasBold,
} from "./letter-markdown.ts";

describe("coerceLetterMarkdown", () => {
  it("assembles JSON sections into ### headers with bold", () => {
    const md = coerceLetterMarkdown(
      JSON.stringify({
        greeting: "Dear [[NAME]],",
        sections: [
          {
            heading: "What stood out",
            body: "You finished something **real** on Thursday.",
          },
          {
            heading: "Carry forward",
            body: "Keep sending the emails.",
          },
        ],
      }),
    );
    assert.match(md, /^Dear \[\[NAME\]\],/);
    assert.match(md, /### What stood out/);
    assert.match(md, /### Carry forward/);
    assert.match(md, /\*\*real\*\*/);
    assert.match(md, /\*\*Keep sending the emails\.\*\*|\*\*Keep sending\*\*/);
  });

  it("forces headers and bold onto plain prose letters", () => {
    const md = coerceLetterMarkdown(`Alex,

You finished something real on Thursday morning. That mattered.

On Wednesday comparison hit hard.

Friday you sent the emails anyway.`);
    assert.match(md, /^Dear \[\[NAME\]\],/);
    assert.match(md, /### What stood out/);
    assert.match(md, /### What shifted/);
    assert.match(md, /\*\*/);
    assert.doesNotMatch(md, /^Alex,/m);
  });

  it("returns empty for NONE", () => {
    assert.equal(coerceLetterMarkdown("NONE"), "");
  });
});

describe("ensureLetterBodyHasBold", () => {
  it("leaves existing bold alone", () => {
    assert.equal(
      ensureLetterBodyHasBold("You finished **something real** today."),
      "You finished **something real** today.",
    );
  });
});
