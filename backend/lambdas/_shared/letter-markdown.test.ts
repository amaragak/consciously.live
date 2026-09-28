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
  it("assembles JSON with preamble, headers, bold, and closing", () => {
    const md = coerceLetterMarkdown(
      JSON.stringify({
        greeting: "Dear [[NAME]],",
        preamble: "I've been sitting with your week.",
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
        closing: "Keep going — you're closer than you think. With care,",
      }),
    );
    assert.match(md, /^Dear \[\[NAME\]\],/);
    assert.match(md, /I've been sitting with your week\./);
    assert.match(md, /### What stood out\nYou finished/);
    assert.match(md, /With care,/);
    assert.doesNotMatch(md, /### What stood out\n\n/);
  });

  it("injects preamble and closing when JSON omits them", () => {
    const md = coerceLetterMarkdown(
      JSON.stringify({
        greeting: "Dear [[NAME]],",
        sections: [
          {
            heading: "What stood out",
            body: "You finished the EP. That shift mattered.",
          },
          {
            heading: "Carry forward",
            body: "Trust the quiet version of you. Keep moving toward November.",
          },
        ],
      }),
    );
    // First sentence peeled into preamble; last into closing.
    assert.match(md, /You finished the EP\./);
    assert.match(md, /### What stood out\n\*\*That shift mattered\.\*\*/);
    assert.match(md, /Keep moving toward November\./);
    assert.match(md, /### Carry forward\n\*\*Trust the quiet version\*\* of you\./);
    // Preamble appears before first heading
    const preIdx = md.indexOf("You finished the EP.");
    const headIdx = md.indexOf("### What stood out");
    assert.ok(preIdx >= 0 && headIdx > preIdx);
  });

  it("assembles JSON with bodyParts (v8 sourced spans)", () => {
    const md = coerceLetterMarkdown(
      JSON.stringify({
        greeting: "Dear [[NAME]],",
        preamble: "This week you finished something real.",
        sections: [
          {
            heading: "The work is done",
            bodyParts: [
              { text: "On Thursday you finished the last vocal take. " },
              {
                text: "That moment mattered",
                sources: [{ entryId: "e1", quote: "vocal take" }],
              },
              { text: ". Your voice held up." },
            ],
          },
          {
            heading: "Then you moved",
            bodyParts: [{ text: "By Saturday you'd sent two emails." }],
          },
        ],
        closing: "Keep going. With care,",
      }),
    );
    assert.match(md, /^Dear \[\[NAME\]\],/);
    assert.match(md, /This week you finished something real\./);
    assert.match(md, /### The work is done\n/);
    assert.match(md, /On Thursday you finished/);
    assert.match(md, /That moment mattered\. Your voice held up\./);
    assert.match(md, /### Then you moved\n/);
    assert.match(md, /By Saturday you'd sent/);
    assert.match(md, /With care,/);
    assert.doesNotMatch(md, /bodyParts|entryId|"greeting"/);
  });

  it("recovers when greeting was prepended to raw letter JSON", () => {
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
    assert.match(md, /^Dear \[\[NAME\]\],/);
    assert.match(md, /A warm open\./);
    assert.match(md, /### What stood out\n/);
    assert.match(md, /showed up anyway/);
    assert.doesNotMatch(md, /\{|"sections"/);
  });

  it("forces headers and bold onto plain prose letters", () => {
    const md = coerceLetterMarkdown(`Alex,

I've been thinking about your week.

You finished something real on Thursday morning. That mattered.

On Wednesday comparison hit hard.

Friday you sent the emails anyway.

Keep going toward November.`);
    assert.match(md, /^Dear \[\[NAME\]\],/);
    assert.match(md, /I've been thinking about your week\./);
    assert.match(md, /### What stood out/);
    assert.match(md, /Keep going toward November\./);
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
