import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/app/AppShell';
import { Dashboard } from '../routes/Dashboard';
import { RunsHomeScreen } from '../routes/RunsHomeScreen';
import { S2OrganismView } from '../routes/S2OrganismView';
import { useRunClient } from '../data/RunClientProvider';
import type { RunMode } from '../state/reducer';

/**
 * AppRoutes — the route table behind the AppShell layout (ARCHITECTURE.md §12):
 *   /                  → S0 RunsHomeScreen (listRuns → cards; FV.2)
 *   /launch            → interim: the existing Dashboard launcher (runId="") so the New Run flow
 *                        reaches a working start-a-run view (FV.2 — preserves the demo + keeps
 *                        RunListPanel reachable; the dedicated S1 Launcher lands in FV.3)
 *   /runs/:id          → S2 Organism View, LIVE (3-pane; FV.4)
 *   /runs/:id/replay   → S2 Organism View, REPLAY (FV.4)
 *   /runs/:id/final    → interim: the Dashboard observatory (renders FinalIdeaPanel on terminal);
 *                        dedicated S5 = FV.7
 *   *                  → redirect to /
 * The observed run + mode come from the URL. The existing tested data layer (runClient/SSE/store) is
 * reused — S2OrganismView via the extracted useRunObservatory hook; /launch + /final via Dashboard.
 */
function LaunchRoute() {
  const runClient = useRunClient();
  const navigate = useNavigate();
  return (
    <Dashboard
      runId=""
      runClient={runClient}
      onObserveLive={(id) => navigate(`/runs/${id}`)}
      onObserveReplay={(id) => navigate(`/runs/${id}/replay`)}
    />
  );
}

/** S2 Organism View (FV.4). key by (mode,id) so it remounts when the URL changes. */
function OrganismRoute({ mode }: { mode: RunMode }) {
  const { id = '' } = useParams();
  const runClient = useRunClient();
  return <S2OrganismView key={`${mode}:${id}`} runId={id} mode={mode} runClient={runClient} />;
}

/** Interim Dashboard observatory for /runs/:id/final until FV.7 builds the dedicated S5. */
function FinalRoute() {
  const { id = '' } = useParams();
  const runClient = useRunClient();
  const navigate = useNavigate();
  return (
    <Dashboard
      key={`final:${id}`}
      runId={id}
      mode="live"
      runClient={runClient}
      onObserveLive={(rid) => navigate(`/runs/${rid}`)}
      onObserveReplay={(rid) => navigate(`/runs/${rid}/replay`)}
    />
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<RunsHomeScreen />} />
        <Route path="launch" element={<LaunchRoute />} />
        <Route path="runs/:id" element={<OrganismRoute mode="live" />} />
        <Route path="runs/:id/replay" element={<OrganismRoute mode="replay" />} />
        <Route path="runs/:id/final" element={<FinalRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
