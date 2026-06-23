/// <reference types="vite/client" />

// PD.14 — declare the optional env-configurable API base (`import.meta.env.VITE_API_BASE`); merges
// into vite/client's `ImportMetaEnv`. Unset → undefined (the data-client falls back to `/api`).
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}
