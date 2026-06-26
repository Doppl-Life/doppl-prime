import { useMemo } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { createRunClient } from './data/runClient';
import { resolveApiBaseUrl } from './data/apiBase';
import { RunClientProvider } from './data/RunClientProvider';
import { AppRoutes } from './app/routes';

/**
 * App root — the FV.1 multi-route shell. Memoizes the single app-level `runClient` (baseUrl resolves
 * from `import.meta.env.VITE_API_BASE ?? '/api'`, PD.14 — default `/api` flows through the Vite dev
 * proxy to the API at :3000) and exposes it to every route via RunClientProvider, wraps the route
 * table (AppShell layout → S0/S1/S2/S5 + replay) in a BrowserRouter. The observed run + mode are
 * URL-derived; the existing tested Dashboard + data layer are reused per-route.
 */
export function App() {
  const runClient = useMemo(
    () => createRunClient({ baseUrl: resolveApiBaseUrl(import.meta.env) }),
    [],
  );
  const basename = resolveRouterBasename(import.meta.env.BASE_URL);
  const routerProps = basename === undefined ? {} : { basename };
  return (
    <BrowserRouter {...routerProps}>
      <RunClientProvider client={runClient}>
        <AppRoutes />
      </RunClientProvider>
    </BrowserRouter>
  );
}

function resolveRouterBasename(baseUrl: string): string | undefined {
  const normalized = baseUrl.trim();
  if (normalized === '' || normalized === '/') return undefined;
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}
