import type { CSSProperties, ReactNode } from 'react';

/**
 * InspectorDrawer (FV.4) — the S2 right-pane inspector SLOT. FV.5 wires node-click → the content
 * (CandidateInspector / AgenomeInspector) as `children`. When `selectedId` is null the drawer is
 * unmounted entirely so the parent grid collapses the third column; when set it slides in (the
 * `drawer-in` keyframe via a named var(--motion-*) token — the global prefers-reduced-motion guard in
 * tokens/base.css neutralizes it) with a Close affordance.
 */
export interface InspectorDrawerProps {
  /** The selected node's id (candidate/agenome). null → closed/empty placeholder. */
  selectedId: string | null;
  onClose: () => void;
  /** FV.5 mounts the inspector content here. */
  children?: ReactNode;
}

const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  height: '100%',
  width: '100%',
  minWidth: 0,
  overflowY: 'auto',
  overflowWrap: 'anywhere',
  background: 'var(--bg-surface)',
  borderLeft: 'thin solid var(--border-subtle)',
  padding: 'var(--space-4)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
  boxSizing: 'border-box',
};
const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};
const heading: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  margin: 0,
};
// Icon-only close affordance — a soft × glyph in the muted text color so it reads as a button cue,
// not as another heading. Brightens to --fg-default on hover via the .inspector-close class.
const closeButton: CSSProperties = {
  marginLeft: 'auto',
  background: 'transparent',
  border: 'none',
  padding: 'var(--space-1)',
  cursor: 'pointer',
  color: 'var(--fg-muted)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-h3)',
  lineHeight: 1,
  borderRadius: 'var(--radius-sm)',
};
export function InspectorDrawer({ selectedId, onClose, children }: InspectorDrawerProps) {
  if (selectedId == null) return null;

  return (
    <aside
      aria-label="Inspector"
      data-testid="inspector-drawer"
      style={{ ...panel, animation: 'drawer-in var(--motion-base) var(--ease-out)' }}
    >
      <div style={header}>
        <h3 style={heading}>Inspector</h3>
        <button
          type="button"
          className="inspector-close"
          onClick={onClose}
          aria-label="Close inspector"
          title="Close inspector"
          style={closeButton}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      {children ?? (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-mono)',
            color: 'var(--fg-muted)',
          }}
        >
          {selectedId}
        </div>
      )}
    </aside>
  );
}
