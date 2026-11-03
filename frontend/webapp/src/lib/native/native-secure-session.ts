/**
 * Native app: keep the refresh token in Keychain (iOS) / Keystore (Android)
 * instead of WebView localStorage, so sessions survive restarts and WebView
 * storage purges. The web build never imports this module.
 */
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { setRefreshTokenStore } from "@/lib/auth-session";

const REFRESH_KEY = "refresh_token";
const EMAIL_KEY = "session_email";
/** Keychain outlives an uninstall; this WebView marker does not. */
const INSTALL_MARKER = "mm_native_install_v1";
const ACTIVE_KEY = "mm_session_active_v1";
const LS_EMAIL_KEY = "mm_session_email_v1";
const LS_REFRESH_KEY = "mm_session_refresh_v1";

let cached: string | null = null;

function persist(token: string | null, email?: string | null) {
  const write = token
    ? SecureStorage.setItem(REFRESH_KEY, token)
    : SecureStorage.removeItem(REFRESH_KEY);
  void write.catch(() => undefined);
  if (email !== undefined) {
    const e = email?.trim();
    void (e ? SecureStorage.setItem(EMAIL_KEY, e) : SecureStorage.removeItem(EMAIL_KEY)).catch(
      () => undefined,
    );
  }
}

/**
 * Load the stored refresh token before the shell decides signed in / out.
 * On a fresh install, wipe whatever a previous install left in the Keychain.
 */
export async function restoreNativeSecureSession(): Promise<void> {
  try {
    await SecureStorage.setKeyPrefix("consciously_");
    if (localStorage.getItem(INSTALL_MARKER) !== "1") {
      await SecureStorage.removeItem(REFRESH_KEY).catch(() => undefined);
      await SecureStorage.removeItem(EMAIL_KEY).catch(() => undefined);
      localStorage.setItem(INSTALL_MARKER, "1");
    }
    cached = (await SecureStorage.getItem(REFRESH_KEY))?.trim() || null;
    const legacy = localStorage.getItem(LS_REFRESH_KEY)?.trim() || null;
    if (!cached && legacy) {
      cached = legacy;
      await SecureStorage.setItem(REFRESH_KEY, legacy);
    }
    localStorage.removeItem(LS_REFRESH_KEY);
    const email = (await SecureStorage.getItem(EMAIL_KEY))?.trim() || null;
    if (cached) {
      // Let ensureMedimadeSession() refresh even if WebView storage was purged.
      localStorage.setItem(ACTIVE_KEY, "1");
      if (email && !localStorage.getItem(LS_EMAIL_KEY)) localStorage.setItem(LS_EMAIL_KEY, email);
    }
  } catch {
    cached = null;
  }
  setRefreshTokenStore({
    read: () => cached,
    write: (token) => {
      cached = token;
      persist(token, token ? localStorage.getItem(LS_EMAIL_KEY) : null);
    },
  });
}
