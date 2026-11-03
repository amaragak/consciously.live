/// <reference types="vite/client" />

/** True for `vite --mode native*` (Capacitor shell builds); false for the web build. */
declare const __NATIVE_BUILD__: boolean;

interface ImportMetaEnv {
  readonly VITE_MEDIMADE_API_URL?: string;
  readonly VITE_MEDIMADE_MEDIA_BASE_URL?: string;
  readonly VITE_MEDIMADE_CHAT_URL?: string;
  readonly VITE_ASSISTANT_CHAT_URL?: string;
  readonly VITE_MEDIMADE_SCRIPT_LAB_URL?: string;
  readonly VITE_MARKETING_ORIGIN?: string;
  /** "1" in internal native test builds: keeps `/dev/audio` in the bundle. */
  readonly VITE_INTERNAL_BUILD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
