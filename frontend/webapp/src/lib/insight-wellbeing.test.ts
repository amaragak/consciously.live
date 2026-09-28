/**
 * Fixture tests for wellbeing visibility (Insights v7).
 * Run: npx tsx --test src/lib/insight-wellbeing.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseWellbeingLevel,
  wellbeingVisibility,
  WELLBEING_LETTER_GUIDANCE,
  fillLetterNamePlaceholder,
  LETTER_NAME_PLACEHOLDER,
} from "./insight-wellbeing.ts";

describe("wellbeing visibility", () => {
  it("none shows the usual cards", () => {
    const v = wellbeingVisibility("none");
    assert.equal(v.fullBanner, false);
    assert.equal(v.softBanner, false);
    assert.equal(v.emotions, true);
    assert.equal(v.wins, true);
    assert.equal(v.turnIntoMeditation, true);
  });

  it("struggling shows soft banner and keeps wins/emotions", () => {
    const v = wellbeingVisibility("struggling");
    assert.equal(v.softBanner, true);
    assert.equal(v.fullBanner, false);
    assert.equal(v.emotions, true);
    assert.equal(v.wins, true);
  });

  it("at_risk shows full banner and hides scores/wins/meditation", () => {
    const v = wellbeingVisibility("at_risk");
    assert.equal(v.fullBanner, true);
    assert.equal(v.emotions, false);
    assert.equal(v.moved, false);
    assert.equal(v.wins, false);
    assert.equal(v.promises, false);
    assert.equal(v.lifts, false);
    assert.equal(v.thoughtMeditation, false);
    assert.equal(v.turnIntoMeditation, false);
    assert.equal(v.mood, true);
    assert.equal(v.entryLinks, true);
  });

  it("parses levels and keeps fixed letter guidance", () => {
    assert.equal(parseWellbeingLevel("at_risk"), "at_risk");
    assert.equal(parseWellbeingLevel({ level: "struggling" }), "struggling");
    assert.equal(parseWellbeingLevel("nope"), "none");
    assert.match(WELLBEING_LETTER_GUIDANCE.struggling, /No pep talk/);
    assert.match(WELLBEING_LETTER_GUIDANCE.at_risk, /No advice/);
  });

  it("fills [[NAME]] from display name at render time", () => {
    const md = `Dear ${LETTER_NAME_PLACEHOLDER},\n\nHello.`;
    assert.equal(
      fillLetterNamePlaceholder(md, "Alex Maragakis"),
      "Dear Alex,\n\nHello.",
    );
    assert.equal(
      fillLetterNamePlaceholder(md, null),
      "Dear friend,\n\nHello.",
    );
    assert.equal(fillLetterNamePlaceholder("no placeholder", "Alex"), "no placeholder");
  });
});
