#!/usr/bin/env npx tsx
/**
 * CDK app entry (filename is historical — do not treat as Medimade).
 *
 * Default: ConsciouslyBackend only.
 *
 * MedimadeBackend is LEGACY. It is NOT instantiated unless you explicitly set
 *   LEGACY_MEDIMADE_STACK=1
 * Do not add new routes/resources there — it is already at/over the CFN 500
 * resource limit and is not the live consciously.live stack.
 */
import * as cdk from "aws-cdk-lib";
import { ConsciouslyStack } from "../lib/consciously-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  // London only. Override with CDK_DEFAULT_REGION only for emergency ops.
  region: process.env.CDK_DEFAULT_REGION ?? "eu-west-2",
};

new ConsciouslyStack(app, "ConsciouslyBackend", {
  env,
  description:
    "consciously.live backend (nested Config/Auth/Database/Media/Api)",
});

/**
 * LEGACY ONLY — opt-in. Never enable during normal deploys.
 * File: lib/medimade-stack.ts — do not extend for new features.
 */
if (process.env.LEGACY_MEDIMADE_STACK === "1") {
  // Lazy require so normal synth never loads the oversized legacy stack module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MedimadeStack } = require("../lib/medimade-stack") as typeof import("../lib/medimade-stack");
  new MedimadeStack(app, "MedimadeBackend", {
    env,
    description:
      "LEGACY medimade.io backend — DO NOT MODIFY; use ConsciouslyBackend",
  });
}

app.synth();
