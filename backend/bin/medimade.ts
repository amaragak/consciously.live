#!/usr/bin/env npx tsx
import * as cdk from "aws-cdk-lib";
import { ConsciouslyStack } from "../lib/consciously-stack";
import { MedimadeStack } from "../lib/medimade-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  // London only. Override with CDK_DEFAULT_REGION only for emergency ops.
  region: process.env.CDK_DEFAULT_REGION ?? "eu-west-2",
};

new MedimadeStack(app, "MedimadeBackend", {
  env,
  description: "medimade.io backend — HTTP API + Fish Audio TTS Lambda",
});

/**
 * Greenfield ConsciouslyBackend — opt-in until cutover.
 * Enable with CONSCIOUSLY_STACK=1 or `-c consciouslyStack=true`.
 * GitHub deploy must not set this yet.
 */
const enableConsciously =
  process.env.CONSCIOUSLY_STACK === "1" ||
  app.node.tryGetContext("consciouslyStack") === true ||
  app.node.tryGetContext("consciouslyStack") === "true";

if (enableConsciously) {
  new ConsciouslyStack(app, "ConsciouslyBackend", {
    env,
    description:
      "consciously.live backend (nested Config/Auth/Database/Media/Api)",
  });
}

app.synth();
