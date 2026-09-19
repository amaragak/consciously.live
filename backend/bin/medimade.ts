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

/** Parallel greenfield stack — nested Config → Auth → Database → Media → Api. */
new ConsciouslyStack(app, "ConsciouslyBackend", {
  env,
  description:
    "consciously.live backend (nested Config/Auth/Database/Media/Api)",
});

app.synth();
