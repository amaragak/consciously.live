import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** Reuses the voice-admin table (pk/sk). */
export const DEV_UI_SETTINGS_PK = "APP_SETTINGS";
export const DEV_UI_SETTINGS_SK = "DEV_UI";

/**
 * Admin-controlled gates for localhost-only UI.
 * `false` → never render. `true` → render only on local/dev hosts.
 */
export type DevUiSettings = {
  /** Create → Audio header: Claude model / pause path / FX toggles. */
  createAudioDevControls: boolean;
  /** Library card cost / bytes flyout. */
  libraryDevFlyout: boolean;
};

export function defaultDevUiSettings(): DevUiSettings {
  return {
    createAudioDevControls: false,
    libraryDevFlyout: false,
  };
}

function tableName(): string | null {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  return n || null;
}

function coerceSettings(raw: unknown): DevUiSettings {
  const base = defaultDevUiSettings();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (typeof o.createAudioDevControls === "boolean") {
    base.createAudioDevControls = o.createAudioDevControls;
  }
  if (typeof o.libraryDevFlyout === "boolean") {
    base.libraryDevFlyout = o.libraryDevFlyout;
  }
  return base;
}

export async function loadDevUiSettings(): Promise<DevUiSettings> {
  const table = tableName();
  if (!table) return defaultDevUiSettings();
  try {
    const out = await ddb.send(
      new GetCommand({
        TableName: table,
        Key: { pk: DEV_UI_SETTINGS_PK, sk: DEV_UI_SETTINGS_SK },
      }),
    );
    return coerceSettings(out.Item?.settings);
  } catch (e) {
    console.error("loadDevUiSettings", e);
    return defaultDevUiSettings();
  }
}

export async function saveDevUiSettings(
  patch: Partial<DevUiSettings>,
): Promise<DevUiSettings> {
  const table = tableName();
  if (!table) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  const current = await loadDevUiSettings();
  const next: DevUiSettings = {
    createAudioDevControls:
      typeof patch.createAudioDevControls === "boolean"
        ? patch.createAudioDevControls
        : current.createAudioDevControls,
    libraryDevFlyout:
      typeof patch.libraryDevFlyout === "boolean"
        ? patch.libraryDevFlyout
        : current.libraryDevFlyout,
  };
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: DEV_UI_SETTINGS_PK,
        sk: DEV_UI_SETTINGS_SK,
        settings: next,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return next;
}
