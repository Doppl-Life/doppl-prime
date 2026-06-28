import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RunClient, StartRunResult } from '../data/runClient';
import type { ProblemSet } from '../data/operatorPromptClient';
import { GenerationOperator } from '../data/contracts';
import { RunConfigPanel } from '../components/run/RunConfigPanel';
import { DEFAULT_FORM, type RunConfigFormValues } from '../components/run/runConfigForm';

// A prepared problem shipped with the launcher (always offered + selected by default), independent of the
// backend /problem-sets catalog.
const DEFAULT_PROBLEM: ProblemSet = {
  id: 'superyacht-drone-privacy',
  title: 'Superyacht drone privacy',
  prompt: `A famous rock star owned a superyacht and used it the way very rich, very famous people sometimes use superyachts: as a private world offshore, away from hotel balconies, public streets, restaurant tables, and ordinary lines of sight. The yacht was not just transport or status. It was where he could host parties, bring people aboard, and behave as if land-based consequences were far away. That assumption had started to fail from above. Paparazzi were using drones launched from shore or nearby vessels to circle the yacht and film open decks before the people onboard could do much about it. The problem was not an abstract dislike of drones. A drone could capture photographs that created a personal scandal. The owner did not want those photographs, but he also did not want the party to stop every time someone saw a dot in the sky. He had bought privacy, not a floating panic room. The Situation The yacht was operating near busy coastal waters, not in an empty military test range. Other vessels, beaches, port infrastructure, aircraft, and public communications systems could be nearby. The captain, crew, and security team were available, but they were not the real customer. Their job was to make the owner's problem disappear without turning his night into a visible security operation. Some anti-drone systems that might be acceptable offshore or in a controlled environment could be illegal or reckless in port-adjacent waters. The yacht could often know a drone was coming before the owner could see it, but detection alone did not decide what the crew should do next. The obvious responses all had problems:
   * A projectile, net gun, or interceptor could bring the drone down, but nobody could control where it would fall or what it might hit.
   * Radio-frequency jamming might affect more than the target drone. The industry had stories of port-side interference causing serious trouble far outside the yacht.
   * Some drones could lose contact, keep recording, and return home with footage anyway.
   * A visible confrontation could attract more attention than the original intrusion.
   * Repeated alarms could train the owner and guests to ignore the warning or ruin the night even when no usable photographs were taken.
The owner wanted the same thing that made the problem hard: keep the party feeling private, effortless, and uninterrupted while making sure a drone did not leave with the wrong photographs. Decision Point You have been asked to recommend a response before the next night onboard. What would you tell the owner's team to do when paparazzi drones approach the yacht? Your proposal should account for detection, timing, crew behavior, legal exposure, false alarms, and the owner's desire to keep the night going. It can combine technology, procedure, crew training, or changes to how exposed areas are used.`,
};

// Launch-page defaults (override the empty DEFAULT_FORM baseline): cross-domain transfer only, ALL ideation
// lenses on, population 8 / generations 4. The seed defaults to the prepared problem above.
const LAUNCH_DEFAULTS: RunConfigFormValues = {
  ...DEFAULT_FORM,
  enabledSubtypes: { cross_domain_transfer: true, zeitgeist_synthesis: false },
  operators: [...GenerationOperator.options],
  caps: { ...DEFAULT_FORM.caps, maxPopulation: 8, maxGenerations: 4 },
};

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
// prepared-problem quick-picks are a SECONDARY action → muted-yellow outline pill (teal stays the
// primary Start CTA). The selected pick fills in.
const PILL_YELLOW = 'color-mix(in srgb, var(--winner-accent) 75%, var(--fg-muted))';
const pickBtn: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  fontWeight: 500,
  color: PILL_YELLOW,
  background: 'color-mix(in srgb, var(--winner-accent) 12%, transparent)',
  border: `thin solid ${PILL_YELLOW}`,
  borderRadius: 'var(--radius-full)',
  padding: 'var(--space-2) var(--space-4)',
  cursor: 'pointer',
};
const pickBtnActive: CSSProperties = {
  ...pickBtn,
  color: 'var(--fg-on-accent)',
  background: PILL_YELLOW,
  fontWeight: 600,
};

export function S1LauncherScreen({ runClient, onStarted }: S1LauncherScreenProps) {
  const [problemSets, setProblemSets] = useState<ProblemSet[]>([]);
  // The seed the RunConfigPanel mounts with; picking a prepared problem prefills it (the panel keeps its own
  // editable copy thereafter). Keyed remount applies a fresh pick without fighting the panel's local edits.
  // Defaults to the shipped DEFAULT_PROBLEM (selected on first load).
  const [seed, setSeed] = useState<string>(DEFAULT_PROBLEM.prompt);
  // Islands pivot A4 — picking a prepared problem tags the run with that problem's id as its caseStudyId, so
  // the run joins that case study's bloom (re-run the same problem → new run, same caseStudyId). A freeform
  // seed leaves it undefined (an untagged one-off run).
  const [caseStudyId, setCaseStudyId] = useState<string | undefined>(DEFAULT_PROBLEM.id);

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

  // The shipped DEFAULT_PROBLEM always leads the quick-picks; drop any backend entry with an identical
  // prompt and the redundant "Cross-domain transfer demo" (our superyacht default already covers it), then
  // cap the row at 4 quick-picks total.
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
  const allProblems = [
    DEFAULT_PROBLEM,
    ...problemSets.filter(
      (ps) =>
        norm(ps.prompt) !== norm(DEFAULT_PROBLEM.prompt) &&
        ps.title.trim().toLowerCase() !== 'cross-domain transfer demo',
    ),
  ].slice(0, 4);

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

        {allProblems.length > 0 && (
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
              {allProblems.map((ps) => {
                const selected = ps.id === caseStudyId;
                return (
                  <button
                    key={ps.id}
                    type="button"
                    aria-pressed={selected}
                    style={selected ? pickBtnActive : pickBtn}
                    onClick={() => {
                      setSeed(ps.prompt);
                      setCaseStudyId(ps.id);
                    }}
                  >
                    {ps.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <RunConfigPanel
          key={`${caseStudyId ?? 'freeform'}:${seed}`}
          runClient={runClient}
          onStarted={onStarted}
          initialValues={{ ...LAUNCH_DEFAULTS, seed }}
          caseStudyId={caseStudyId}
        />
      </div>
    </section>
  );
}
