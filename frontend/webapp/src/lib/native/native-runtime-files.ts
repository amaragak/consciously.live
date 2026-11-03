import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

/**
 * Files under `native-assets/runtime/` are served at `/native/*` by the web view,
 * but native players can't read `capacitor://` / `https://localhost` URLs.
 * Copy them into app storage once and hand out `file://` URIs instead.
 */
const cache = new Map<string, Promise<string>>();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export function nativeRuntimeFileUri(name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  const p = (async () => {
    const path = `native-runtime/${name}`;
    try {
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
      await Filesystem.stat({ path, directory: Directory.Data });
      return uri;
    } catch {
      /* not copied yet */
    }
    const res = await fetch(`/native/${name}`);
    if (!res.ok) throw new Error(`/native/${name}: HTTP ${res.status}`);
    const data = await blobToBase64(await res.blob());
    await Filesystem.writeFile({ path, data, directory: Directory.Data, recursive: true });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
    return uri;
  })();
  cache.set(name, p);
  p.catch(() => cache.delete(name));
  return p;
}

/**
 * Lock-screen artwork. Remote covers must be https. Fallback: iOS resolves a
 * relative path against the bundled web dir; Android needs a `file://` URI.
 */
export async function nowPlayingArtwork(coverUrl: string | undefined): Promise<string> {
  const cover = coverUrl?.trim() ?? "";
  if (cover.startsWith("https://")) return cover;
  if (Capacitor.getPlatform() === "ios") return "native/now-playing.png";
  try {
    return await nativeRuntimeFileUri("now-playing.png");
  } catch {
    return "";
  }
}
