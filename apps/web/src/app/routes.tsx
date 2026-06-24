import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/app/AppShell';
import { Dashboard } from '../routes/Dashboard';
import { useRunClient } from '../data/RunClientProvider';
import type { RunMode } from '../state/reducer';

/**
 * AppRoutes — the FV.1 route table behind the AppShell layout (ARCHITECTURE.md §12):
 *   /                  → home (the existing Dashboard's launcher + run-list, runId="")
 *   /launch            → interim redirect to / (the dedicated S1 Launcher lands in FV.3)
 *   /runs/:id          → the observatory in LIVE mode (runId from the URL)
 *   /runs/:id/replay   → the observatory in REPLAY mode
 *   /runs/:id/final    → interim: the observatory (it renders FinalIdeaPanel on terminal); the
 *                        dedicated S5 Final Idea lands in FV.7
 *   *                  → redirect to /
 * The observed run + mode come from the URL (not Dashboard-internal state); the launcher/run-list nav
 * callbacks route through useNavigate. The existing tested data layer (runClient/SSE/store) is reused.
 */
function HomeRoute() {
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

function RunRoute({ mode }: { mode: RunMode }) {
  const { id = '' } = useParams();
  const runClient = useRunClient();
  const navigate = useNavigate();
  // key by (mode,id) so the Dashboard remounts when the URL changes — observedRunId always tracks the
  // URL (no stale internal state when navigating /runs/a → /runs/b within the same Route).
  return (
    <Dashboard
      key={`${mode}:${id}`}
      runId={id}
      mode={mode}
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
        <Route index element={<HomeRoute />} />
        <Route path="launch" element={<Navigate to="/" replace />} />
        <Route path="runs/:id" element={<RunRoute mode="live" />} />
        <Route path="runs/:id/replay" element={<RunRoute mode="replay" />} />
        <Route path="runs/:id/final" element={<RunRoute mode="live" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
