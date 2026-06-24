import { useMemo } from 'react';
import { createRunClient } from './data/runClient';
import { resolveApiBaseUrl } from './data/apiBase';
import { Dashboard } from './routes/Dashboard';

/**
 * App root — mounts the P7.14 Dashboard shell. The data-client baseUrl resolves from
 * `import.meta.env.VITE_API_BASE ?? '/api'` (PD.14): default `/api` flows through the Vite dev proxy
 * to the API at :3000 (prefix-stripped); an operator can override to a non-proxy origin.
 * The Dashboard opens with the run-launcher; starting a run switches the observed run id.
 */
export function App() {
  const runClient = useMemo(
    () => createRunClient({ baseUrl: resolveApiBaseUrl(import.meta.env) }),
    [],
  );
  return <Dashboard runId="" runClient={runClient} />;
}
