import type { CSSProperties, ReactNode } from 'react';
import { Button } from '../ds';

/**
 * InspectorDrawer (FV.4) — the S2 right-pane inspector SLOT. FV.4 builds the container + open/close +
 * an honest empty placeholder (never blank); FV.5 wires node-click → the content (CandidateInspector /
 * AgenomeInspector) as `children`. When `selectedId` is null the drawer shows the placeholder; when
 * set it slides in (the `drawer-in` keyframe via a named var(--motion-*) token — the global
 * prefers-reduced-motion guard in tokens/base.css neutralizes it) with a Close affordance.
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
  background: 'var(--bg-surface)',
  borderLeft: 'thin solid var(--border-subtle)',
  padding: 'var(--space-4)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
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
const empty: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  textAlign: 'center',
  color: 'var(--fg-faint)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-caption)',
  padding: 'var(--space-4)',
};

export function InspectorDrawer({ selectedId, onClose, children }: InspectorDrawerProps) {
  if (selectedId == null) {
    return (
      <aside aria-label="Inspector" style={panel}>
        <div style={empty}>Select a node in the graph to inspect its details.</div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Inspector"
      data-testid="inspector-drawer"
      style={{ ...panel, animation: 'drawer-in var(--motion-base) var(--ease-out)' }}
    >
      <div style={header}>
        <h3 style={heading}>Inspector</h3>
        <span style={{ marginLeft: 'auto' }}>
          <Button
            variant="ghost"
            size="sm"
            glyph="✕"
            onClick={onClose}
            aria-label="Close inspector"
          >
            Close
          </Button>
        </span>
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
