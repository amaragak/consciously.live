/**
 * Fixture tests for insight periods (Insights v6).
 * Run: npx tsx --test frontend/webapp/src/lib/insight-period.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysToDate,
  daysBetweenInclusive,
  insightRangeKey,
  insightSortKey,
  latestInsightEndDate,
  migrateStoredPeriod,
  parseInsightRangeKey,
  periodUiCopy,
  resolveInsightPeriod,
  resolveSinceLastLetterPeriod,
  trimTextsToBudget,
  weekBoundsForDate,
  zonedRangeToIso,
} from "./insight-period.ts";

describe("insight-period date maths", () => {
  it("crosses month ends", () => {
    assert.equal(addDaysToDate("2026-01-30", 2), "2026-02-01");
    assert.equal(addDaysToDate("2026-02-27", 3), "2026-03-02");
    assert.equal(daysBetweenInclusive("2026-01-30", "2026-02-02"), 4);
  });

  it("week bounds are Monday–Sunday", () => {
    // 2026-09-28 is a Monday
    assert.deepEqual(weekBoundsForDate("2026-09-28"), {
      startDate: "2026-09-28",
      endDate: "2026-10-04",
    });
    // Wednesday
    assert.deepEqual(weekBoundsForDate("2026-09-30"), {
      startDate: "2026-09-28",
      endDate: "2026-10-04",
    });
  });

  it("handles a DST spring-forward local day as a full local day", () => {
    // US Pacific: 2026-03-08 clocks spring forward.
    const { startIso, endIso } = zonedRangeToIso(
      "2026-03-08",
      "2026-03-08",
      "America/Los_Angeles",
    );
    const start = new Date(startIso);
    const end = new Date(endIso);
    assert.ok(end.getTime() > start.getTime());
    // Local day is still ~23 hours of wall time after the jump, but the
    // absolute span must cover the whole local calendar day.
    assert.ok(end.getTime() - start.getTime() >= 22 * 3600_000);
    assert.ok(end.getTime() - start.getTime() <= 25 * 3600_000);
  });
});

describe("resolveInsightPeriod", () => {
  const now = new Date("2026-09-28T15:00:00.000Z");

  it("builds last7 / last30 from today in the zone", () => {
    const r7 = resolveInsightPeriod(
      { periodType: "last7", timeZone: "UTC" },
      now,
    );
    assert.equal(r7.ok, true);
    if (!r7.ok) return;
    assert.equal(r7.period.startDate, "2026-09-22");
    assert.equal(r7.period.endDate, "2026-09-28");
    assert.equal(r7.period.days, 7);

    const r30 = resolveInsightPeriod(
      { periodType: "last30", timeZone: "UTC" },
      now,
    );
    assert.equal(r30.ok, true);
    if (!r30.ok) return;
    assert.equal(r30.period.days, 30);
    assert.equal(r30.period.endDate, "2026-09-28");
  });

  it("rejects invalid custom ranges", () => {
    const future = resolveInsightPeriod(
      {
        periodType: "custom",
        startDate: "2026-09-01",
        endDate: "2099-01-01",
        timeZone: "UTC",
      },
      now,
    );
    assert.equal(future.ok, false);

    const flipped = resolveInsightPeriod(
      {
        periodType: "custom",
        startDate: "2026-09-20",
        endDate: "2026-09-10",
        timeZone: "UTC",
      },
      now,
    );
    assert.equal(flipped.ok, false);

    const tooLong = resolveInsightPeriod(
      {
        periodType: "custom",
        startDate: "2026-01-01",
        endDate: "2026-09-01",
        timeZone: "UTC",
      },
      now,
    );
    assert.equal(tooLong.ok, false);
  });

  it("accepts a valid custom range", () => {
    const ok = resolveInsightPeriod(
      {
        periodType: "custom",
        startDate: "2026-09-01",
        endDate: "2026-09-20",
        timeZone: "UTC",
      },
      now,
    );
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.period.days, 20);
  });

  it("builds sinceLast from the day after last end through today", () => {
    const ok = resolveSinceLastLetterPeriod("2026-09-20", "UTC", now);
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.period.periodType, "sinceLast");
    assert.equal(ok.period.startDate, "2026-09-21");
    assert.equal(ok.period.endDate, "2026-09-28");
    assert.equal(ok.period.days, 8);
  });

  it("rejects sinceLast when last letter already covers today", () => {
    const bad = resolveSinceLastLetterPeriod("2026-09-28", "UTC", now);
    assert.equal(bad.ok, false);
  });
});

describe("latestInsightEndDate", () => {
  it("picks the latest inclusive end day across letters", () => {
    assert.equal(
      latestInsightEndDate([
        { endDate: "2026-09-10" },
        { endDate: "2026-09-20", weekEnd: "2026-09-14" },
        { weekEnd: "2026-09-18T12:00:00.000Z" },
      ]),
      "2026-09-20",
    );
    assert.equal(latestInsightEndDate([]), null);
  });
});

describe("storage keys and migration", () => {
  it("RANGE keys identify an exact range (replace-vs-new)", () => {
    assert.equal(
      insightSortKey("2026-09-22", "2026-09-28"),
      "RANGE#2026-09-22#2026-09-28",
    );
    assert.equal(
      insightRangeKey("2026-09-22", "2026-09-28"),
      "2026-09-22_2026-09-28",
    );
    // Same range → same key (replace). Different range → different key (new).
    assert.notEqual(
      insightSortKey("2026-09-22", "2026-09-28"),
      insightSortKey("2026-09-01", "2026-09-30"),
    );
  });

  it("migrates WEEKLY# rows to periodType week", () => {
    // 2026-09-28 is a Monday.
    const m = migrateStoredPeriod({
      sk: "WEEKLY#2026-09-28",
      weekKey: "2026-09-28",
    });
    assert.deepEqual(m, {
      periodType: "week",
      startDate: "2026-09-28",
      endDate: "2026-10-04",
    });
  });

  it("parses deep-link keys and legacy Monday week links", () => {
    assert.deepEqual(parseInsightRangeKey("2026-09-01_2026-09-20"), {
      startDate: "2026-09-01",
      endDate: "2026-09-20",
    });
    assert.deepEqual(parseInsightRangeKey("2026-09-28"), {
      startDate: "2026-09-28",
      endDate: "2026-10-04",
    });
  });
});

describe("token budget trimming", () => {
  it("shortens proportionally and keeps start and end", () => {
    const a = "AAAA".repeat(2000); // 8000
    const b = "BBBB".repeat(2000); // 8000
    const c = "CCCC".repeat(2000); // 8000
    const out = trimTextsToBudget([a, b, c], 6000, 200);
    const total = out.reduce((n, t) => n + t.length, 0);
    assert.ok(total <= 6000);
    assert.equal(out.length, 3);
    for (const t of out) {
      assert.ok(t.includes("[…]"));
      assert.ok(t.startsWith("AAAA") || t.startsWith("BBBB") || t.startsWith("CCCC"));
    }
  });
});

describe("periodUiCopy", () => {
  it("uses week language for week and last7", () => {
    assert.equal(
      periodUiCopy(7, "week").meditationTitle,
      "Turn this week into a meditation",
    );
    assert.equal(
      periodUiCopy(7, "last7").periodNoun,
      "this week",
    );
  });

  it("does not call a short custom/sinceLast range a week", () => {
    assert.equal(
      periodUiCopy(5, "custom").meditationTitle,
      "Turn these days into a meditation",
    );
    assert.equal(
      periodUiCopy(3, "sinceLast").periodNoun,
      "these days",
    );
  });

  it("uses month language for last30", () => {
    assert.equal(
      periodUiCopy(30, "last30").meditationTitle,
      "Turn this month into a meditation",
    );
  });
});
