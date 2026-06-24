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
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  marginBottom: 'var(--space-3)',
};
const pickBtn: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-default)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2) var(--space-3)',
  cursor: 'pointer',
};

export function S1LauncherScreen({ runClient, onStarted }: S1LauncherScreenProps) {
  const [problemSets, setProblemSets] = useState<ProblemSet[]>([]);
  // The seed the RunConfigPanel mounts with; picking a prepared problem prefills it (the panel keeps its own
  // editable copy thereafter). Keyed remount applies a fresh pick without fighting the panel's local edits.
  const [seed, setSeed] = useState<string>('');

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
      style={{ padding: 'var(--space-5)', color: 'var(--fg-default)' }}
    >
      <h1 style={heading}>Launch a run</h1>
      <p style={helpText}>
        Start from a prepared problem, or write your own seed prompt below — then tune the mutagen
        operators and the diverge/converge dial.
      </p>

      {problemSets.length > 0 && (
        <div
          aria-label="Prepared problems"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-5)',
          }}
        >
          {problemSets.map((ps) => (
            <button key={ps.id} type="button" style={pickBtn} onClick={() => setSeed(ps.prompt)}>
              {ps.title}
            </button>
          ))}
        </div>
      )}

      <RunConfigPanel
        key={seed}
        runClient={runClient}
        onStarted={onStarted}
        initialValues={{ ...DEFAULT_FORM, seed }}
      />
    </section>
  );
}
