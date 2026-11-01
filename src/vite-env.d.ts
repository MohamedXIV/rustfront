/// <reference types="vite/client" />

/** Build-time settings. Defaults live in src/config.ts. */
interface ImportMetaEnv {
  readonly VITE_SPACETIME_URI?: string;
  readonly VITE_SPACETIME_DB?: string;
}
