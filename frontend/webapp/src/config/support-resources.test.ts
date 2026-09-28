/**
 * Fixture-style tests for support resources + country resolution (Insights v7).
 * Run: npx tsx --test src/config/support-resources.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUPPORT_RESOURCES,
  supportResourcesStaleReasons,
  getSupportCountry,
} from "./support-resources.ts";
import {
  countryFromLocale,
  countryFromTimeZone,
  resolveSupportCountryCode,
} from "../lib/support-country.ts";

describe("support-resources seed", () => {
  it("includes the required countries and emergency numbers", () => {
    assert.equal(getSupportCountry("GB")?.emergencyNumber, "999");
    assert.equal(getSupportCountry("IE")?.emergencyNumber, "112");
    assert.equal(getSupportCountry("US")?.emergencyNumber, "911");
    assert.equal(getSupportCountry("CA")?.emergencyNumber, "911");
    assert.equal(getSupportCountry("AU")?.emergencyNumber, "000");
    assert.equal(getSupportCountry("NZ")?.emergencyNumber, "111");
    assert.ok(SUPPORT_RESOURCES.international.url.includes("findahelpline"));
  });

  it("marks seeded resources as unverified until checked", () => {
    const reasons = supportResourcesStaleReasons();
    assert.ok(reasons.length > 0);
    assert.ok(reasons.some((r) => /lastVerified is null/.test(r)));
  });

  it("production guard fails when lastVerified is null or stale", () => {
    // In production builds this suite should fail until numbers are verified.
    // Locally / non-production we only assert the helper reports problems.
    const isProd = process.env.NODE_ENV === "production";
    const reasons = supportResourcesStaleReasons();
    if (isProd) {
      assert.equal(
        reasons.length,
        0,
        `Support resources need verifying before production:\n${reasons.join("\n")}`,
      );
    } else {
      assert.ok(reasons.length > 0);
    }
  });
});

describe("support country resolution", () => {
  it("prefers account, then stored, then timezone, then locale", () => {
    assert.equal(
      resolveSupportCountryCode({
        accountCountry: "AU",
        storedCountry: "US",
        timeZone: "Europe/London",
        locale: "en-GB",
      }),
      "AU",
    );
    assert.equal(
      resolveSupportCountryCode({
        accountCountry: null,
        storedCountry: "CA",
        timeZone: "Europe/London",
        locale: "en-GB",
      }),
      "CA",
    );
    assert.equal(
      resolveSupportCountryCode({
        accountCountry: null,
        storedCountry: null,
        timeZone: "Europe/London",
        locale: "en-US",
      }),
      "GB",
    );
    assert.equal(
      resolveSupportCountryCode({
        accountCountry: null,
        storedCountry: null,
        timeZone: "Etc/UTC",
        locale: "en-US",
      }),
      "US",
    );
    assert.equal(
      resolveSupportCountryCode({
        accountCountry: null,
        storedCountry: null,
        timeZone: "Etc/UTC",
        locale: "xx",
      }),
      null,
    );
  });

  it("maps common zones and locales", () => {
    assert.equal(countryFromTimeZone("Pacific/Auckland"), "NZ");
    assert.equal(countryFromLocale("en-IE"), "IE");
  });
});
