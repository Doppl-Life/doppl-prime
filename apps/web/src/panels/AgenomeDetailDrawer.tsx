import { type JSX, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRunState, useRunStore } from "../state/runStore.js";
import { AgenomeInspector } from "./AgenomeInspector.js";

/**
 * AgenomeDetailDrawer — portal-mounted right-side panel that wraps
 * AgenomeInspector. Visible when state.selection.agenomeId is set,
 * dismissed by ESC or by the close button. Dismiss dispatches
 * SELECT_AGENOME with null so the reducer clears the selection and the
 * mutual-exclusion guarantee from Task 1 still holds.
 *
 * Unlike a modal, there is no backdrop scrim — the rest of the
 * dashboard stays interactive while the drawer is open, so the
 * operator can keep inspecting the lineage graph or Energy panel while
 * the detail view sits alongside.
 *
 * Rendered at document.body so it overlays the whole dashboard rather
 * than getting clipped by a parent's overflow.
 */
export function AgenomeDetailDrawer(): JSX.Element | null {
  const state = useRunState();
  const { dispatch } = useRunStore();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const open = state.selection.agenomeId != null;

  // Close on ESC. Attached at the document level so the drawer still
  // closes when focus has wandered outside its content. The listener is
  // only registered while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ kind: "SELECT_AGENOME", agenomeId: null });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  // Move keyboard focus to the close button on open so a screen-reader
  // or keyboard user lands inside the drawer rather than back wherever
  // they clicked.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const close = () => dispatch({ kind: "SELECT_AGENOME", agenomeId: null });

  return createPortal(
    <aside
      role="dialog"
      aria-label="Agenome detail"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: "min(480px, 92vw)",
        background: "var(--doppl-bg-surface, #0e1424)",
        color: "var(--doppl-text-primary)",
        borderLeft: "1px solid var(--doppl-border)",
        boxShadow: "-12px 0 36px rgba(0, 0, 0, 0.35)",
        overflow: "auto",
        // Top padding leaves room for the close button to sit clear of
        // the inspector's PanelTitle.
        padding: "44px 20px 20px",
        zIndex: 1000,
      }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        aria-label="Close agenome detail"
        onClick={close}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255, 255, 255, 0.06)",
          border: "1px solid var(--doppl-border)",
          borderRadius: 8,
          color: "var(--doppl-text-primary)",
          fontSize: 18,
          fontWeight: 600,
          cursor: "pointer",
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
      <AgenomeInspector />
    </aside>,
    document.body,
  );
}
