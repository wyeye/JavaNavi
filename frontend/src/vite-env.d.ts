/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JAVANAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
