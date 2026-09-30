import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import {
  BG_AUDIO_CATEGORIES,
  BG_AUDIO_PREFIX,
  mergeByStemPreferMp3,
  parseAnyBgAudioKey,
  type BgAudioCategory,
  type ListedBgItem,
} from "./_shared/background-audio-keys";
import { listAllSoundRows, soundIsInCustomerPicker } from "./_shared/sound-catalog";
import { listFactoryMixes } from "./_shared/factory-mixes";
import {
  getBgAudioListCache,
  getBgAudioListCacheVersion,
  putBgAudioListCache,
} from "./_shared/bg-audio-list-cache";
import {
  coerceSoundSubcategory,
  inferSoundSubcategory,
} from "./_shared/sound-taxonomy";

const s3 = new S3Client({});

function publicMediaUrl(cfDomain: string, key: string): string {
  return `https://${cfDomain}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function json(
  statusCode: number,
  payload: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type,Authorization,If-None-Match",
      "Access-Control-Expose-Headers": "ETag,X-Cache",
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}

function clientIfNoneMatch(event: APIGatewayProxyEventV2): string | null {
  const h = event.headers ?? {};
  const raw =
    h["if-none-match"] ??
    h["If-None-Match"] ??
    h["IF-NONE-MATCH"] ??
    "";
  const v = String(raw).trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  return v || null;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method === "OPTIONS") {
    return json(204, {});
  }
  if (event.requestContext.http.method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const bucket = process.env.MEDIA_BUCKET_NAME;
  if (!bucket) {
    return json(500, { error: "MEDIA_BUCKET_NAME is not set" });
  }

  const domain = (process.env.MEDIA_CLOUDFRONT_DOMAIN || "").trim();
  const baseUrl = domain ? `https://${domain}` : undefined;
  const forceRefresh =
    event.queryStringParameters?.refresh === "1" ||
    event.queryStringParameters?.nocache === "1";

  try {
    if (!forceRefresh) {
      const cached = await getBgAudioListCache();
      if (cached) {
        const inm = clientIfNoneMatch(event);
        if (inm && inm === cached.version) {
          return {
            statusCode: 304,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Expose-Headers": "ETag,X-Cache",
              ETag: `"${cached.version}"`,
              "X-Cache": "HIT-304",
              "Cache-Control": "private, max-age=60, stale-while-revalidate=600",
            },
            body: "",
          };
        }
        return json(
          200,
          { ...cached.payload, cacheVersion: cached.version },
          {
            ETag: `"${cached.version}"`,
            "X-Cache": "HIT",
            "Cache-Control": "private, max-age=60, stale-while-revalidate=600",
          },
        );
      }
    }

    const payload = await buildBackgroundAudioPayload({ bucket, domain, baseUrl });
    const version =
      (await getBgAudioListCacheVersion()) || new Date().toISOString();
    await putBgAudioListCache(version, payload);
    return json(
      200,
      { ...payload, cacheVersion: version },
      {
        ETag: `"${version}"`,
        "X-Cache": forceRefresh ? "BYPASS" : "MISS",
        "Cache-Control": "private, max-age=60, stale-while-revalidate=600",
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ListObjects failed";
    return json(500, { error: msg });
  }
}

async function buildBackgroundAudioPayload(params: {
  bucket: string;
  domain: string;
  baseUrl: string | undefined;
}): Promise<Record<string, unknown>> {
  const { bucket, domain, baseUrl } = params;
  const objects: { Key?: string; Size?: number }[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: BG_AUDIO_PREFIX,
        ContinuationToken: token,
      }),
    );
    objects.push(...(page.Contents ?? []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  const buckets: Record<BgAudioCategory, ListedBgItem[]> = {
    ambience: [],
    music: [],
    compositions: [],
    drums: [],
    noise: [],
  };

  const mixerKeys = new Set<string>();
  const nameOverride = new Map<string, string>();
  const categoryOverride = new Map<string, BgAudioCategory>();
  const subcategoryOverride = new Map<string, string>();
  const coverUrlByKey = new Map<string, string>();
  const coverThumbUrlByKey = new Map<string, string>();
  const catalogConfigured = Boolean(process.env.SOUND_CATALOG_TABLE_NAME);
  const catalogRows = catalogConfigured
    ? await listAllSoundRows().catch((e) => {
        console.warn("sound catalog overlay skipped", e);
        return [];
      })
    : [];
  const factoryMixes = catalogConfigured
    ? await listFactoryMixes().catch((e) => {
        console.warn("factory mixes overlay skipped", e);
        return [];
      })
    : [];
  for (const row of catalogRows) {
    if (soundIsInCustomerPicker(row)) mixerKeys.add(row.sk);
    const displayName = row.name.trim();
    if (displayName) nameOverride.set(row.sk, displayName);
    if (row.category && BG_AUDIO_CATEGORIES.includes(row.category)) {
      categoryOverride.set(row.sk, row.category);
      subcategoryOverride.set(
        row.sk,
        coerceSoundSubcategory(
          row.category,
          row.subcategory || inferSoundSubcategory(row.category, row.packPath || row.sk),
        ),
      );
    }
    const coverUrl =
      (typeof row.coverImageUrl === "string" && row.coverImageUrl.trim()) ||
      (domain &&
      typeof row.coverImageKey === "string" &&
      row.coverImageKey.trim()
        ? publicMediaUrl(domain, row.coverImageKey.trim())
        : "");
    if (coverUrl) {
      coverUrlByKey.set(row.sk, coverUrl);
      const stem = row.sk.replace(/\.(mp3|wav)$/i, "");
      coverUrlByKey.set(`${stem}.mp3`, coverUrl);
      coverUrlByKey.set(`${stem}.wav`, coverUrl);
    }
    const thumbUrl =
      (typeof row.coverImageThumbUrl === "string" &&
        row.coverImageThumbUrl.trim()) ||
      (domain &&
      typeof row.coverImageThumbKey === "string" &&
      row.coverImageThumbKey.trim()
        ? publicMediaUrl(domain, row.coverImageThumbKey.trim())
        : "");
    if (thumbUrl) {
      coverThumbUrlByKey.set(row.sk, thumbUrl);
      const stem = row.sk.replace(/\.(mp3|wav)$/i, "");
      coverThumbUrlByKey.set(`${stem}.mp3`, thumbUrl);
      coverThumbUrlByKey.set(`${stem}.wav`, thumbUrl);
    }
  }

  function coverForKey(key: string): string | null {
    return (
      coverUrlByKey.get(key) ??
      coverUrlByKey.get(key.replace(/\.(mp3|wav)$/i, "") + ".mp3") ??
      coverUrlByKey.get(key.replace(/\.(mp3|wav)$/i, "") + ".wav") ??
      null
    );
  }

  function coverThumbForKey(key: string): string | null {
    return (
      coverThumbUrlByKey.get(key) ??
      coverThumbUrlByKey.get(key.replace(/\.(mp3|wav)$/i, "") + ".mp3") ??
      coverThumbUrlByKey.get(key.replace(/\.(mp3|wav)$/i, "") + ".wav") ??
      null
    );
  }

  const rawItems: {
    key: string;
    name: string;
    size: number | null;
    category: BgAudioCategory;
    subcategory: string;
  }[] = [];
  for (const o of objects) {
    if (!o.Key) continue;
    const parsed = parseAnyBgAudioKey(o.Key);
    if (!parsed) continue;
    const lower = parsed.key.toLowerCase();
    const catalogKey = lower.endsWith(".wav")
      ? `${parsed.key.slice(0, -4)}.mp3`
      : parsed.key;
    if (
      catalogConfigured &&
      !mixerKeys.has(catalogKey) &&
      !mixerKeys.has(parsed.key)
    ) {
      continue;
    }
    const cat =
      categoryOverride.get(catalogKey) ??
      categoryOverride.get(parsed.key) ??
      parsed.folderCategory;
    if (!cat) continue;
    const subcategory =
      subcategoryOverride.get(catalogKey) ??
      subcategoryOverride.get(parsed.key) ??
      coerceSoundSubcategory(cat, inferSoundSubcategory(cat, parsed.rel || parsed.key));
    rawItems.push({
      key: parsed.key,
      name:
        nameOverride.get(catalogKey) ??
        nameOverride.get(parsed.key) ??
        parsed.name,
      size: o.Size ?? null,
      category: cat,
      subcategory,
    });
  }

  const seen = new Set<string>();
  for (const item of rawItems) {
    const k = item.key.toLowerCase().endsWith(".wav")
      ? `${item.key.slice(0, -4)}.mp3`
      : item.key;
    seen.add(k);
    seen.add(item.key);
    buckets[item.category].push(item);
  }
  for (const row of catalogRows) {
    if (!soundIsInCustomerPicker(row)) continue;
    if (seen.has(row.sk)) continue;
    const cat = row.category;
    if (!BG_AUDIO_CATEGORIES.includes(cat)) continue;
    buckets[cat].push({
      key: row.sk,
      name: row.name,
      size: null,
      subcategory:
        subcategoryOverride.get(row.sk) ??
        coerceSoundSubcategory(cat, inferSoundSubcategory(cat, row.packPath || row.sk)),
      coverImageUrl: coverForKey(row.sk),
      coverImageThumbUrl: coverThumbForKey(row.sk),
    });
  }

  for (const c of BG_AUDIO_CATEGORIES) {
    const merged = mergeByStemPreferMp3(buckets[c]);
    const subByStem = new Map<string, string>();
    for (const it of buckets[c]) {
      const stem = it.key.replace(/\.(mp3|wav)$/i, "");
      if (it.subcategory && !subByStem.has(stem)) subByStem.set(stem, it.subcategory);
    }
    buckets[c] = merged.map((it) => {
      const stem = it.key.replace(/\.(mp3|wav)$/i, "");
      return {
        ...it,
        name:
          nameOverride.get(it.key) ??
          nameOverride.get(`${stem}.mp3`) ??
          nameOverride.get(`${stem}.wav`) ??
          it.name,
        subcategory:
          subByStem.get(stem) ??
          coerceSoundSubcategory(c, inferSoundSubcategory(c, it.key)),
        coverImageUrl: coverForKey(it.key),
        coverImageThumbUrl: coverThumbForKey(it.key),
      };
    });
    buckets[c].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Compositions have no fader of their own — they ride the music channel and
  // show up there as a single folder, so picking one fills the music slot.
  const musicChannel = [
    ...buckets.music,
    ...buckets.compositions.map((it) => ({
      ...it,
      subcategory: "compositions",
      coverImageUrl: it.coverImageUrl ?? coverForKey(it.key),
      coverImageThumbUrl: it.coverImageThumbUrl ?? coverThumbForKey(it.key),
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...(baseUrl ? { baseUrl } : {}),
    nature: buckets.ambience,
    ambience: buckets.ambience,
    music: musicChannel,
    compositions: buckets.compositions,
    drums: buckets.drums,
    noise: buckets.noise,
    factoryMixes,
    /** @deprecated flat list; prefer nature/music/drums/noise */
    items: [
      ...buckets.ambience,
      ...musicChannel,
      ...buckets.drums,
      ...buckets.noise,
    ],
  };
}
