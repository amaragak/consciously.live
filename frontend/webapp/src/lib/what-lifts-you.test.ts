/**
 * Fixture tests for What lifts you (Insights v5).
 * Run: npx tsx --test frontend/webapp/src/lib/what-lifts-you.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeWhatLiftsYou,
  type WhatLiftsEntry,
  type WhatLiftsLetter,
} from "./what-lifts-you.ts";

const AS_OF = new Date(2026, 8, 28, 12, 0, 0, 0); // Mon 28 Sep 2026 local

function dayIso(offsetDays: number, hour = 10): string {
  const d = new Date(
    AS_OF.getFullYear(),
    AS_OF.getMonth(),
    AS_OF.getDate() + offsetDays,
    hour,
    0,
    0,
    0,
  );
  return d.toISOString();
}

function entry(
  id: string,
  offsetDays: number,
  mood: string,
): WhatLiftsEntry {
  return { id, at: dayIso(offsetDays), mood };
}

function letter(
  activities: Array<{ entryId: string; items: string[] }>,
): WhatLiftsLetter {
  return { weekKey: "fixture", activities };
}

describe("computeWhatLiftsYou", () => {
  it("empty: 0 good or low days", () => {
    const r = computeWhatLiftsYou(
      [entry("a", 0, "mixed"), entry("b", -1, "heavy")],
      [letter([{ entryId: "a", items: ["walk"] }])],
      AS_OF,
    );
    assert.equal(r.stage, "empty");
    assert.match(r.emptyMessage ?? "", /Tag a mood/);
    assert.equal(r.good.length, 0);
    assert.equal(r.low.length, 0);
  });

  it("stage 1: 1 good day lists activities without counts wording", () => {
    const r = computeWhatLiftsYou(
      [entry("e1", -1, "good")],
      [
        letter([
          { entryId: "e1", items: ["Morning walk", "coffee", "email"] },
        ]),
      ],
      AS_OF,
    );
    assert.equal(r.stage, 1);
    assert.equal(r.goodLabel, "On your good day");
    assert.equal(r.good.length, 3);
    assert.equal(r.low.length, 0);
    assert.match(r.footer ?? "", /Early days/);
    assert.equal(r.windowLabel, "Last 4 weeks");
  });

  it("stage 2: 3 good days and 1 low day shows counts", () => {
    const entries: WhatLiftsEntry[] = [
      entry("g1", -1, "good"),
      entry("g2", -2, "calm"),
      entry("g3", -3, "good"),
      entry("l1", -4, "low"),
    ];
    const letters: WhatLiftsLetter[] = [
      letter([
        { entryId: "g1", items: ["walk"] },
        { entryId: "g2", items: ["walk"] },
        { entryId: "g3", items: ["walk", "studio"] },
        { entryId: "l1", items: ["scrolling", "walk"] },
      ]),
    ];
    const r = computeWhatLiftsYou(entries, letters, AS_OF);
    assert.equal(r.stage, 2);
    assert.equal(r.goodDays, 3);
    assert.equal(r.lowDays, 1);
    assert.match(r.goodLabel, /3 good or calm days/);
    // walk on 3 good days (≥2) and more on good than low → included
    const walk = r.good.find((x) => /walk/i.test(x.label));
    assert.ok(walk);
    assert.equal(walk!.count, 3);
    assert.equal(walk!.of, 3);
    // scrolling only on 1 low day → excluded (<2)
    assert.equal(r.low.length, 0);
    assert.match(r.footer ?? "", /Early days/);
  });

  it("stage 3: clear patterns use tends-to labels", () => {
    const entries: WhatLiftsEntry[] = [];
    const rows: Array<{ entryId: string; items: string[] }> = [];
    // 8 good days with walk, 2 low days with scrolling (10 mood-tagged)
    for (let i = 0; i < 8; i += 1) {
      const id = `g${i}`;
      entries.push(entry(id, -i, i % 2 === 0 ? "good" : "calm"));
      rows.push({ entryId: id, items: ["walk", "studio"] });
    }
    for (let i = 0; i < 2; i += 1) {
      const id = `l${i}`;
      entries.push(entry(id, -(8 + i), "low"));
      rows.push({ entryId: id, items: ["scrolling"] });
    }
    const r = computeWhatLiftsYou(entries, [letter(rows)], AS_OF);
    assert.equal(r.stage, 3);
    assert.equal(r.footer, null);
    assert.match(r.goodLabel, /Tends to show up on your good days/);
    assert.match(r.lowLabel, /Tends to show up on your low days/);
    assert.ok(r.good.some((x) => /walk/i.test(x.label)));
    // scrolling only on 2 low days (<3) → not stage-3 on low
    assert.equal(r.low.length, 0);
  });

  it("stage 3 threshold miss falls back to stage 2", () => {
    const entries: WhatLiftsEntry[] = [];
    const rows: Array<{ entryId: string; items: string[] }> = [];
    // 8 good + 2 low, but activities appear on both sides evenly → no stage-3 skew
    for (let i = 0; i < 8; i += 1) {
      const id = `g${i}`;
      entries.push(entry(id, -i, "good"));
      rows.push({ entryId: id, items: ["tea"] });
    }
    for (let i = 0; i < 2; i += 1) {
      const id = `l${i}`;
      entries.push(entry(id, -(8 + i), "low"));
      rows.push({ entryId: id, items: ["tea"] });
    }
    // Add two more low days so lowDays >= 2 and tea appears 2 on low (<3) —
    // good tea has 8 days but share vs low: 8/8 vs 2/2 = 1.0 vs 1.0, not clearly higher
    const r = computeWhatLiftsYou(entries, [letter(rows)], AS_OF);
    assert.equal(r.moodTaggedDays, 10);
    assert.equal(r.stage, 2);
    assert.match(r.footer ?? "", /Early days/);
    // stage 2: tea on good 8 times, more than low 2 → shown on good
    assert.ok(r.good.some((x) => /tea/i.test(x.label)));
  });

  it("extends window when fewer than 6 mood-tagged days in 4 weeks", () => {
    // Only one tagged day 9 weeks ago → need to extend
    const entries = [entry("old", -9 * 7, "good")];
    const letters = [
      letter([{ entryId: "old", items: ["garden"] }]),
    ];
    const r = computeWhatLiftsYou(entries, letters, AS_OF);
    assert.ok(r.windowWeeks >= 9);
    assert.match(r.windowLabel, new RegExp(`Last ${r.windowWeeks} weeks`));
    assert.equal(r.stage, 1);
    assert.ok(r.good.some((x) => /garden/i.test(x.label)));
  });
});
