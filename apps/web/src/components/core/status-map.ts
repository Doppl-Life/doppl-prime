/**
 * status-map — the single source of truth mapping every FROZEN domain status to its accessible
 * encoding {glyph, label, colorToken} (ARCHITECTURE.md §12). Ported FROM the design-system prototype
 * (docs/doppl-design-system/components/core/StatusBadge.jsx) but the FROZEN @doppl/contracts enums are
 * the authority for which statuses exist — drift reconciled frozen-wins:
 *   - agenome 'mutated' (prototype-only) is OMITTED (not a frozen AgenomeStatus value).
 *   - candidate 'culled' IS mapped (frozen CandidateStatus has it).
 *   - a 'generation' domain is ADDED for the frozen GenerationStatus 8-state (no prototype mapping
 *     existed; encodings derived from the prototype's visual vocabulary, reusing existing tokens).
 * Colors are referenced as `var(--token)` only (never raw hex — design-system adherence). Status is
 * shape + icon + label + color — NEVER color alone (the colorToken is the 4th redundant channel).
 */

export type StatusDomain = 'agenome' | 'candidate' | 'check' | 'run' | 'generation' | 'subtype';

export interface StatusSpec {
  /** The shape/icon glyph (the primary, colorblind-safe, grayscale-surviving channel). */
  readonly glyph: string;
  /** The human + machine-truth label (snake_case statuses kept verbatim). */
  readonly label: string;
  /** A `var(--token)` color reference — the 4th redundant channel, never the sole encoding. */
  readonly colorToken: string;
  /** Liveness breathing pulse (active / under_review / running phases). */
  readonly pulse?: boolean;
  /** A `var(--glow-...)` reference for the winner / living emphasis. */
  readonly glow?: string;
  /** Render as a text pill (subtype) rather than a glyph+label row. */
  readonly pill?: boolean;
}

/** The distinct neutral indicator for an unknown/unmapped status — never throws, never blank. */
export const NEUTRAL_SPEC: StatusSpec = {
  glyph: '?',
  label: 'unknown',
  colorToken: 'var(--fg-muted)',
};

export const STATUS_MAP: Record<StatusDomain, Record<string, StatusSpec>> = {
  agenome: {
    // Display 'spawned' (not 'seeded') so the agenome's INITIAL lifecycle state doesn't read like the
    // 'Seeded organism' PROVENANCE legend — every agenome (incl. mutation/fusion-born) enters here. The
    // frozen AgenomeStatus enum value stays 'seeded'.
    seeded: { glyph: '◌', label: 'spawned', colorToken: 'var(--status-seeded)' },
    active: { glyph: '◐', label: 'active', colorToken: 'var(--status-active)', pulse: true },
    spent: { glyph: '○', label: 'spent', colorToken: 'var(--status-spent)' },
    eligible_parent: { glyph: '★', label: 'eligible', colorToken: 'var(--status-eligible)' },
    failed: { glyph: '△', label: 'failed', colorToken: 'var(--status-failed)' },
    reproduced: { glyph: '⚇', label: 'reproduced', colorToken: 'var(--status-reproduced)' },
    culled: { glyph: '✕', label: 'culled', colorToken: 'var(--status-culled)' },
  },
  candidate: {
    created: { glyph: '·', label: 'created', colorToken: 'var(--status-created)' },
    // [sv5] created→repairing→under_review structured-output repair edge (≤1 retry; rule #8 — a
    // repair is not a failure). Active/pulsing, in-flight-toned like under_review; ↻ reads "self-heal
    // in progress" (text-presentation glyph, shape-distinct from under_review's ◐).
    repairing: { glyph: '↻', label: 'repairing', colorToken: 'var(--status-review)', pulse: true },
    under_review: {
      glyph: '◐',
      label: 'under review',
      colorToken: 'var(--status-review)',
      pulse: true,
    },
    checked: { glyph: '◑', label: 'checked', colorToken: 'var(--status-checked)' },
    scored: { glyph: '◉', label: 'scored', colorToken: 'var(--status-scored)' },
    selected: {
      glyph: '♔',
      label: 'selected',
      colorToken: 'var(--status-selected)',
      glow: 'var(--glow-winner)',
    },
    rejected: { glyph: '✕', label: 'rejected', colorToken: 'var(--status-rejected)' },
    culled: { glyph: '✕', label: 'culled', colorToken: 'var(--status-culled)' },
    invalid: { glyph: '△', label: 'invalid', colorToken: 'var(--status-invalid)' },
  },
  check: {
    passed: { glyph: '✓', label: 'passed', colorToken: 'var(--check-passed)' },
    failed: { glyph: '✕', label: 'failed', colorToken: 'var(--check-failed)' },
    skipped: { glyph: '–', label: 'skipped', colorToken: 'var(--check-skipped)' },
  },
  run: {
    configured: { glyph: '○', label: 'configured', colorToken: 'var(--fg-muted)' },
    running: { glyph: '●', label: 'live', colorToken: 'var(--status-active)', pulse: true },
    completing: {
      glyph: '◐',
      label: 'completing',
      colorToken: 'var(--status-active)',
      pulse: true,
    },
    completed: { glyph: '✔', label: 'complete', colorToken: 'var(--success)' },
    stopping: { glyph: '◐', label: 'stopping', colorToken: 'var(--warning)' },
    stopped: { glyph: '■', label: 'stopped', colorToken: 'var(--warning)' },
    failed: { glyph: '△', label: 'failed', colorToken: 'var(--danger)' },
    cancelled: { glyph: '✕', label: 'cancelled', colorToken: 'var(--fg-faint)' },
  },
  // ADDED (frozen GenerationStatus; no prototype mapping). Run-like phase glyphs reusing tokens.
  generation: {
    pending: { glyph: '○', label: 'pending', colorToken: 'var(--fg-muted)' },
    running: { glyph: '●', label: 'running', colorToken: 'var(--status-active)', pulse: true },
    // [sv5] running→degraded→verifying partial-failure edge — NON-terminal, distinct from `failed`.
    // ◓ (text-presentation, shape-distinct from △ failed) + amber --warning + NON-pulse mark it as
    // "impaired but progressing", set apart from the teal/blue pulsing healthy phases and from danger.
    degraded: { glyph: '◓', label: 'degraded', colorToken: 'var(--warning)' },
    verifying: { glyph: '◐', label: 'verifying', colorToken: 'var(--status-checked)', pulse: true },
    scoring: { glyph: '◑', label: 'scoring', colorToken: 'var(--status-scored)', pulse: true },
    reproducing: {
      glyph: '⚇',
      label: 'reproducing',
      colorToken: 'var(--status-reproduced)',
      pulse: true,
    },
    completed: { glyph: '✔', label: 'complete', colorToken: 'var(--success)' },
    failed: { glyph: '△', label: 'failed', colorToken: 'var(--danger)' },
    skipped: { glyph: '–', label: 'skipped', colorToken: 'var(--check-skipped)' },
  },
  subtype: {
    cross_domain_transfer: {
      glyph: 'XFER',
      label: 'cross_domain_transfer',
      colorToken: 'var(--subtype-transfer)',
      pill: true,
    },
    zeitgeist_synthesis: {
      glyph: 'ZEIT',
      label: 'zeitgeist_synthesis',
      colorToken: 'var(--subtype-zeitgeist)',
      pill: true,
    },
  },
};

/** Resolve a (domain, status) to its spec; an unmapped value returns the neutral indicator (the
 *  status string preserved as the label) — never throws, never blanks. */
export function resolveStatus(domain: StatusDomain | undefined, status: string): StatusSpec {
  const spec = domain ? STATUS_MAP[domain][status] : undefined;
  return spec ?? { ...NEUTRAL_SPEC, label: status || NEUTRAL_SPEC.label };
}
