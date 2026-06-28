import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RunClient, StartRunResult } from '../data/runClient';
import type { ProblemSet } from '../data/operatorPromptClient';
import { RunConfigPanel } from '../components/run/RunConfigPanel';
import { DEFAULT_FORM } from '../components/run/runConfigForm';

/**
 * S1 Run Launcher (FV.3, ARCHITECTURE.md §11/§12). The dedicated launch screen that replaces the interim
 * Dashboard launcher: a PROMPT SOURCE (the GET /problem-sets prepared catalog as quick-picks, or a freeform
 * seed) feeding the RunConfigPanel, which now also carries the FB run-controls — the mutagen-operator picker
 * (FB.3) + the diverge/converge dial (FB.4) + the caps clamped to the fetched maxima. Start → POST /runs →
 * the caller observes the new run. All controls bias GENERATION only; the launcher exposes NO judge/scoring
 * lever (rule #6). Read-only over /problem-sets (a failed/empty fetch still allows a freeform start).
 */
export interface S1LauncherScreenProps {
  runClient: RunClient;
  onStarted: (run: StartRunResult) => void;
}

const heading: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-h1)',
  color: 'var(--fg-default)',
  margin: 0,
  marginBottom: 'var(--space-2)',
};
const helpText: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-body)',
  color: 'var(--fg-muted)',
  margin: 0,
  marginBottom: 'var(--space-5)',
  maxWidth: '52rem',
};
const eyebrow: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  fontWeight: 600,
  // a quiet label heading — kept neutral white so it doesn't compete with the terracotta pills below.
  color: 'var(--fg-default)',
  letterSpacing: '0.04em',
  margin: 0,
  marginBottom: 'var(--space-2)',
};
// prepared-problem quick-picks are a SECONDARY action → honey-amber outline pill (teal stays the
// primary Start CTA), giving the launch screen a clear warm/cool two-accent rhythm.
const pickBtn: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  fontWeight: 500,
  color: 'var(--accent-2)',
  background: 'var(--accent-2-soft)',
  border: 'thin solid var(--accent-2)',
  borderRadius: 'var(--radius-full)',
  padding: 'var(--space-2) var(--space-4)',
  cursor: 'pointer',
};

export function S1LauncherScreen({ runClient, onStarted }: S1LauncherScreenProps) {
  const [problemSets, setProblemSets] = useState<ProblemSet[]>([]);
  // The seed the RunConfigPanel mounts with; picking a prepared problem prefills it (the panel keeps its own
  // editable copy thereafter). Keyed remount applies a fresh pick without fighting the panel's local edits.
  const [seed, setSeed] = useState<string>('');
  // Islands pivot A4 — picking a prepared problem tags the run with that problem's id as its caseStudyId, so
  // the run joins that case study's bloom (re-run the same problem → new run, same caseStudyId). A freeform
  // seed leaves it undefined (an untagged one-off run).
  const [caseStudyId, setCaseStudyId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    runClient
      .getProblemSets()
      .then((sets) => {
        if (active) setProblemSets(sets);
      })
      .catch(() => undefined); // a failed fetch still allows a freeform start
    return () => {
      active = false;
    };
  }, [runClient]);

  return (
    <section
      aria-label="Launch a run"
      style={{ padding: 'var(--space-6) var(--space-5)', color: 'var(--fg-default)' }}
    >
      <div style={{ maxWidth: '64rem', margin: '0 auto' }}>
        <h1 style={heading}>Launch a run</h1>
        <p style={helpText}>
          Doppl breeds candidate ideas against your problem under selection pressure. Start from a
          prepared problem or write your own seed prompt, choose the kinds of idea to generate, then
          tune the ideation lenses and how widely the swarm explores.
        </p>

        {problemSets.length > 0 && (
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <p style={eyebrow}>Start from a prepared problem</p>
            <div
              aria-label="Prepared problems"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              {problemSets.map((ps) => (
                <button
                  key={ps.id}
                  type="button"
                  style={pickBtn}
                  onClick={() => {
                    setSeed(ps.prompt);
                    setCaseStudyId(ps.id);
                  }}
                >
                  {ps.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <RunConfigPanel
          key={`${caseStudyId ?? 'freeform'}:${seed}`}
          runClient={runClient}
          onStarted={onStarted}
          initialValues={{ ...DEFAULT_FORM, seed }}
          caseStudyId={caseStudyId}
        />
      </div>
    </section>
  );
}
