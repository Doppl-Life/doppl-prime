/**
 * PD.14 — the data-client baseUrl is env-configurable so an operator can point the dashboard at a
 * non-proxy API origin; the default `/api` is the Vite dev-proxy path (→ the API at :3000, prefix
 * stripped). Pure over an INJECTED env (App.tsx passes `import.meta.env`) so the resolution is
 * deterministic + DOM/import.meta-free in tests. Honors the brief's nullish-coalescing semantics
 * (`?? '/api'`): only an unset (undefined) var falls back — Vite yields undefined for an unset var.
 */
export interface ApiBaseEnv {
  readonly VITE_API_BASE?: string;
}

export function resolveApiBaseUrl(env: ApiBaseEnv): string {
  return env.VITE_API_BASE ?? '/api';
}
