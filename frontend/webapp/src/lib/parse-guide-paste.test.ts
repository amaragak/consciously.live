/**
 * Run: npx tsx --test frontend/webapp/src/lib/parse-guide-paste.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeGuideBodyFromPaste,
  composePracticeBriefFromPaste,
  parseGuidePaste,
  type GuidePasteGuide,
} from "./parse-guide-paste.ts";

const FIXTURE = `=== GUIDE ===
slug: example-guide
title: An example guide
category: Basics
read_minutes: 3
order: 1
image:
draft: false

--- KEY IDEA ---
A short sentence that sums up the guide.

--- TRY THIS ---
title: Try this · 2 minutes
1. Settle | Find somewhere you can stay still.
2. Listen | Notice whatever is there.
3. Let it pass | Rest in what is left.

--- CTA ---
title: A first meditation
body: We'll make a short meditation to get you started.
label: Make this meditation

--- BODY ---
Opening paragraph.

## A heading

- A list item
- Another list item

---

Text after a plain horizontal rule.

=== END ===`;

function assertGuide(g: GuidePasteGuide) {
  assert.equal(g.slug, "example-guide");
  assert.equal(g.title, "An example guide");
  assert.equal(g.category, "Basics");
  assert.equal(g.readMinutes, 3);
  assert.equal(g.order, 1);
  assert.equal(g.image, null);
  assert.equal(g.draft, false);
  assert.equal(g.keyIdea, "A short sentence that sums up the guide.");
  assert.equal(g.tryThisTitle, "Try this · 2 minutes");
  assert.equal(g.tryThisSteps.length, 3);
  assert.deepEqual(g.tryThisSteps[0], {
    order: 1,
    title: "Settle",
    text: "Find somewhere you can stay still.",
  });
  assert.equal(g.ctaTitle, "A first meditation");
  assert.equal(g.ctaBody, "We'll make a short meditation to get you started.");
  assert.equal(g.ctaLabel, "Make this meditation");
  assert.match(g.body, /^Opening paragraph\./);
  assert.match(g.body, /^---$/m);
  assert.match(g.body, /Text after a plain horizontal rule\./);
}

describe("parseGuidePaste fixture", () => {
  it("parses the reference paste", () => {
    const result = parseGuidePaste(FIXTURE);
    assert.ok("guides" in result);
    if (!("guides" in result)) return;
    assert.equal(result.guides.length, 1);
    assertGuide(result.guides[0]!);
    assert.equal(result.warnings.length, 0);
  });

  it("preserves curly quotes, apostrophes, en dashes, middle dots", () => {
    const paste = FIXTURE.replace(
      "A short sentence that sums up the guide.",
      "It’s a “short” sentence – try this · now.",
    );
    const result = parseGuidePaste(paste);
    assert.ok("guides" in result);
    if (!("guides" in result)) return;
    assert.equal(
      result.guides[0]!.keyIdea,
      "It’s a “short” sentence – try this · now.",
    );
  });
});

describe("parseGuidePaste multi + endings", () => {
  it("parses two guides in one paste", () => {
    const second = FIXTURE.replace("example-guide", "second-guide").replace(
      "An example guide",
      "Second guide",
    );
    const result = parseGuidePaste(`${FIXTURE}\n\n${second}`);
    assert.ok("guides" in result);
    if (!("guides" in result)) return;
    assert.equal(result.guides.length, 2);
    assert.equal(result.guides[0]!.slug, "example-guide");
    assert.equal(result.guides[1]!.slug, "second-guide");
    assert.equal(result.guides[1]!.title, "Second guide");
  });

  it("accepts \\r\\n line endings", () => {
    const crlf = FIXTURE.replace(/\n/g, "\r\n");
    const result = parseGuidePaste(crlf);
    assert.ok("guides" in result);
    if (!("guides" in result)) return;
    assertGuide(result.guides[0]!);
  });

  it("warns when === END === is missing", () => {
    const noEnd = FIXTURE.replace(/\n=== END ===\s*$/, "");
    const result = parseGuidePaste(noEnd);
    assert.ok("guides" in result);
    if (!("guides" in result)) return;
    assert.equal(result.guides.length, 1);
    assert.equal(result.guides[0]!.slug, "example-guide");
    assert.ok(
      result.warnings.some((w) => /Missing === END ===/i.test(w.message)),
    );
  });

  it("keeps step text after the first pipe", () => {
    const paste = FIXTURE.replace(
      "2. Listen | Notice whatever is there.",
      "2. Listen | Notice a | b | c.",
    );
    const result = parseGuidePaste(paste);
    assert.ok("guides" in result);
    if (!("guides" in result)) return;
    assert.equal(result.guides[0]!.tryThisSteps[1]!.text, "Notice a | b | c.");
  });

  it("treats a plain --- inside BODY as content", () => {
    const result = parseGuidePaste(FIXTURE);
    assert.ok("guides" in result);
    if (!("guides" in result)) return;
    const body = result.guides[0]!.body;
    assert.match(body, /\n---\n/);
    assert.match(body, /Text after a plain horizontal rule/);
  });
});

describe("parseGuidePaste errors", () => {
  it("errors on missing slug", () => {
    const paste = FIXTURE.replace("slug: example-guide\n", "");
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(result.errors.some((e) => /Missing slug/i.test(e.message)));
    assert.ok(result.errors.every((e) => e.line >= 1));
  });

  it("errors on missing title", () => {
    const paste = FIXTURE.replace("title: An example guide\n", "");
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(result.errors.some((e) => /Missing title/i.test(e.message)));
  });

  it("errors on missing category", () => {
    const paste = FIXTURE.replace("category: Basics\n", "");
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(result.errors.some((e) => /Missing category/i.test(e.message)));
  });

  it("errors on missing BODY section", () => {
    const paste = FIXTURE.replace(
      /--- BODY ---[\s\S]*?(?==== END ===)/,
      "",
    );
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(result.errors.some((e) => /Missing BODY/i.test(e.message)));
  });

  it("errors on invalid slug characters", () => {
    const paste = FIXTURE.replace("slug: example-guide", "slug: Example_Guide!");
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(
      result.errors.some((e) => /Slug must be lowercase/i.test(e.message)),
    );
  });

  it("errors on non-numeric read_minutes", () => {
    const paste = FIXTURE.replace("read_minutes: 3", "read_minutes: three");
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(
      result.errors.some((e) => /read_minutes must be a number/i.test(e.message)),
    );
  });

  it("errors on non-numeric order", () => {
    const paste = FIXTURE.replace("order: 1", "order: first");
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(
      result.errors.some((e) => /order must be a number/i.test(e.message)),
    );
  });

  it("errors when draft is not true or false", () => {
    const paste = FIXTURE.replace("draft: false", "draft: maybe");
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(
      result.errors.some((e) => /draft must be true or false/i.test(e.message)),
    );
  });

  it("errors on malformed TRY THIS step", () => {
    const paste = FIXTURE.replace(
      "1. Settle | Find somewhere you can stay still.",
      "1. Settle without a pipe",
    );
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(
      result.errors.some((e) =>
        /TRY THIS step must look like/i.test(e.message),
      ),
    );
  });

  it("errors on missing KEY IDEA section", () => {
    const paste = FIXTURE.replace(
      /--- KEY IDEA ---[\s\S]*?(?=--- TRY THIS ---)/,
      "",
    );
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(
      result.errors.some((e) => /Missing KEY IDEA section/i.test(e.message)),
    );
  });

  it("errors on missing TRY THIS section", () => {
    const paste = FIXTURE.replace(
      /--- TRY THIS ---[\s\S]*?(?=--- CTA ---)/,
      "",
    );
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(
      result.errors.some((e) => /Missing TRY THIS section/i.test(e.message)),
    );
  });

  it("errors on missing CTA section", () => {
    const paste = FIXTURE.replace(/--- CTA ---[\s\S]*?(?=--- BODY ---)/, "");
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(
      result.errors.some((e) => /Missing CTA section/i.test(e.message)),
    );
  });

  it("errors on missing CTA title, body, or label", () => {
    const paste = FIXTURE.replace(
      /--- CTA ---[\s\S]*?(?=--- BODY ---)/,
      "--- CTA ---\nlabel: Only label\n\n",
    );
    const result = parseGuidePaste(paste);
    assert.ok("errors" in result);
    if (!("errors" in result)) return;
    assert.ok(result.errors.some((e) => /CTA is missing title/i.test(e.message)));
    assert.ok(result.errors.some((e) => /CTA is missing body/i.test(e.message)));
  });

  it("warns on unknown header keys without failing", () => {
    const paste = FIXTURE.replace(
      "draft: false",
      "draft: false\nauthor: alex",
    );
    const result = parseGuidePaste(paste);
    assert.ok("guides" in result);
    if (!("guides" in result)) return;
    assert.equal(result.guides.length, 1);
    assert.ok(
      result.warnings.some((w) => /Unknown header key/i.test(w.message)),
    );
  });
});

describe("compose helpers", () => {
  it("builds practiceBrief and body shortcodes", () => {
    const result = parseGuidePaste(FIXTURE);
    assert.ok("guides" in result);
    if (!("guides" in result)) return;
    const g = result.guides[0]!;
    assert.equal(
      composePracticeBriefFromPaste(g),
      "A first meditation\nWe'll make a short meditation to get you started.",
    );
    const body = composeGuideBodyFromPaste(g);
    assert.match(body, /:::key\nA short sentence/);
    assert.match(body, /:::try 2 minutes\n1\. \*\*Settle\*\*/);
    assert.match(body, /Opening paragraph/);
  });
});
