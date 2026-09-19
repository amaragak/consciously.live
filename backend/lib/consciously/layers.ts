import * as fs from "fs";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import type { Construct } from "constructs";

export type ConsciouslyLayers = {
  ffmpegLayer: lambda.ILayerVersion;
  fastembedLayer: lambda.LayerVersion;
  pedalboardLayer: lambda.LayerVersion;
};

/**
 * Shared Lambda layers owned by the parent stack (avoids duplicating LayerVersion assets).
 */
export function createConsciouslyLayers(scope: Construct): ConsciouslyLayers {
  const ffmpegLayerArn =
    process.env.MEDIMADE_FFMPEG_LAYER_ARN?.trim() ||
    process.env.CONSCIOUSLY_FFMPEG_LAYER_ARN?.trim() ||
    "arn:aws:lambda:eu-west-2:382309212161:layer:medimade-ffmpeg-audio-tools:1";
  const ffmpegLayer = LayerVersion.fromLayerVersionArn(
    scope,
    "FfmpegLayer",
    ffmpegLayerArn,
  );

  const fastembedLayerRoot = path.join(__dirname, "../../layers/fastembed");
  const fastembedPackageInit = path.join(
    fastembedLayerRoot,
    "python/lib/python3.12/site-packages/fastembed/__init__.py",
  );
  if (!fs.existsSync(fastembedPackageInit)) {
    throw new Error(
      "Fastembed Lambda layer missing. From backend/ run: ./scripts/build-fastembed-layer " +
        "(Docker preferred; manylinux wheel fallback), then commit layers/fastembed/python/. " +
        "See layers/fastembed/README.md.",
    );
  }
  const fastembedLayer = new lambda.LayerVersion(scope, "FastembedLayer", {
    code: lambda.Code.fromAsset(fastembedLayerRoot),
    compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
    description:
      "fastembed + BGE-small-en-v1.5 ONNX (rebuild: scripts/build-fastembed-layer)",
  });

  const pedalboardLayerRoot = path.join(__dirname, "../../layers/pedalboard");
  const pedalboardPackageInit = path.join(
    pedalboardLayerRoot,
    "python/lib/python3.12/site-packages/pedalboard/__init__.py",
  );
  if (!fs.existsSync(pedalboardPackageInit)) {
    throw new Error(
      "Pedalboard Lambda layer missing. From backend/ run: ./scripts/build-pedalboard-layer " +
        "(requires Docker), then commit layers/pedalboard/python/. See layers/pedalboard/README.md.",
    );
  }
  const pedalboardLayer = new lambda.LayerVersion(scope, "PedalboardLayer", {
    code: lambda.Code.fromAsset(pedalboardLayerRoot),
    compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
    description:
      "Spotify Pedalboard (rebuild: scripts/build-pedalboard-layer, commit layers/pedalboard/python)",
  });

  return { ffmpegLayer, fastembedLayer, pedalboardLayer };
}
