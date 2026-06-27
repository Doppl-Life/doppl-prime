import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/app/AppShell';
import { S1LauncherScreen } from '../routes/S1LauncherScreen';
import { RunsHomeScreen } from '../routes/RunsHomeScreen';
import { S2OrganismView } from '../routes/S2OrganismView';
import { S5FinalIdeaScreen } from '../routes/S5FinalIdeaScreen';
import { KnowledgeView } from '../routes/KnowledgeView';
import { CaseStudyBloomView } from '../routes/CaseStudyBloomView';
import { useRunClient } from '../data/RunClientProvider';
import type { RunMode } from '../state/reducer';

/**
 * AppRoutes — the route table behind the AppShell layout (ARCHITECTURE.md §12):
 *   /                  → S0 RunsHomeScreen (listRuns → cards; FV.2)
 *   /launch            → S1 Run Launcher (prompt-source picker + the RunConfigPanel with the FB
 *                        run-controls: mutagen-operator picker + diverge/converge dial; FV.3)
 *   /runs/:id          → S2 Organism View, LIVE (3-pane; FV.4)
 *   /runs/:id/replay   → S2 Organism View, REPLAY (FV.4)
 *   /runs/:id/final    → S5 Final-Idea / payoff screen (winner card + generational climb; FV.7)
 *   *                  → redirect to /
 * The observed run + mode come from the URL. The existing tested data layer (runClient/SSE/store) is
 * reused — S2OrganismView + S5FinalIdeaScreen via the extracted useRunObservatory hook; /launch via Dashboard.
 */
function LaunchRoute() {
  const runClient = useRunClient();
  const navigate = useNavigate();
  // FV.3 — the dedicated S1 launcher; Start navigates to the live organism view for the new run.
  return (
    <S1LauncherScreen runClient={runClient} onStarted={(run) => navigate(`/runs/${run.runId}`)} />
  );
}

/** S2 Organism View (FV.4). key by (mode,id) so it remounts when the URL changes. */
function OrganismRoute({ mode }: { mode: RunMode }) {
  const { id = '' } = useParams();
  const runClient = useRunClient();
  return <S2OrganismView key={`${mode}:${id}`} runId={id} mode={mode} runClient={runClient} />;
}

/** Knowledge-Evolution graph (KB) for /runs/:id/knowledge. Keyed by id so it remounts per run. */
function KnowledgeRoute() {
  const { id = '' } = useParams();
  const runClient = useRunClient();
  return <KnowledgeView key={`knowledge:${id}`} runId={id} runClient={runClient} />;
}

/** Islands bloom (case study → runs → doppels) for /case-studies/:id. Keyed by id so it remounts per case study. */
function CaseStudyRoute() {
  const { id = '' } = useParams();
  const runClient = useRunClient();
  return <CaseStudyBloomView key={`case-study:${id}`} caseStudyId={id} runClient={runClient} />;
}

/** S5 Final-Idea / payoff screen (FV.7) for /runs/:id/final. Keyed by id; mode='live' (the replay-final
 *  label is FV.8). Clicking the winner's lineage ref jumps to the organism view to inspect that node. */
function FinalRoute() {
  const { id = '' } = useParams();
  const runClient = useRunClient();
  const navigate = useNavigate();
  return (
    <S5FinalIdeaScreen
      key={`final:${id}`}
      runId={id}
      mode="live"
      runClient={runClient}
      onSelectLineageNode={() => navigate(`/runs/${id}`)}
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
        <Route path="runs/:id/knowledge" element={<KnowledgeRoute />} />
        <Route path="case-studies/:id" element={<CaseStudyRoute />} />
        <Route path="runs/:id/final" element={<FinalRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
