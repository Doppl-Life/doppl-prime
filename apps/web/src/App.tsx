import { useMemo } from 'react';
import { createRunClient } from './data/runClient';
import { Dashboard } from './routes/Dashboard';

/**
 * App root — mounts the P7.14 Dashboard shell. The data-client baseUrl points at the API origin (the
 * dev/demo server); the live SSE endpoint + real getLineage/getCandidate land at the demo→cody merge.
 * The Dashboard opens with the run-launcher; starting a run switches the observed run id.
 */
export function App() {
  const runClient = useMemo(() => createRunClient({ baseUrl: '/api' }), []);
  return <Dashboard runId="" runClient={runClient} />;
}
