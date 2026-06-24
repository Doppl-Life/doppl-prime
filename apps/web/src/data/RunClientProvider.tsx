import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { RunClient } from './runClient';

/**
 * RunClientProvider — exposes the single app-level `runClient` (memoized once in App.tsx, survives
 * route changes) to every route via context, so the data layer is reused (not recreated per route).
 * The dashboard stays read-only over projections; the client is the one write seam (rule #2). (FV.1)
 */
const RunClientContext = createContext<RunClient | null>(null);

export function RunClientProvider({
  client,
  children,
}: {
  client: RunClient;
  children: ReactNode;
}) {
  return <RunClientContext.Provider value={client}>{children}</RunClientContext.Provider>;
}

/** The app-level runClient. Throws if used outside a RunClientProvider (no silent null client). */
export function useRunClient(): RunClient {
  const client = useContext(RunClientContext);
  if (!client) {
    throw new Error('useRunClient must be used within a RunClientProvider');
  }
  return client;
}
