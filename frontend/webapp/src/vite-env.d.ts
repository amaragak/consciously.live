/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MEDIMADE_API_URL?: string;
  readonly VITE_MEDIMADE_MEDIA_BASE_URL?: string;
  readonly VITE_MEDIMADE_CHAT_URL?: string;
  readonly VITE_ASSISTANT_CHAT_URL?: string;
  readonly VITE_MEDIMADE_SCRIPT_LAB_URL?: string;
  readonly VITE_MARKETING_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
