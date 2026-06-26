import type { JSX } from "react";
import { DashboardShell } from "./layout/DashboardShell.js";
import { RunStoreProvider } from "./state/runStore.js";

/**
 * App root (P7.14). Wraps the dashboard shell in the RunStoreProvider
 * so the SSE subscription + state reducer are available to every
 * panel. The shell composition pins the §12 panel set.
 */
export default function App(): JSX.Element {
  const baseUrl =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? "";
  return (
    <RunStoreProvider baseUrl={baseUrl}>
      <DashboardShell />
    </RunStoreProvider>
  );
}
