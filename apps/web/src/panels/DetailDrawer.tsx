import { type JSX, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRunState, useRunStore } from "../state/runStore.js";
import { AgenomeInspector } from "./AgenomeInspector.js";
import { CandidateDetailInspector } from "./CandidateDetailInspector.js";

/**
 * DetailDrawer — the universal right-side detail surface. Visible
 * whenever there is a selection (agenome or candidate). When an
 * agenome is selected, renders AgenomeInspector; when a candidate is
 * selected, renders CandidateDetailInspector. Mutual exclusion in the
 * reducer (one selection at a time) means we never have to decide
 * which side wins inside the drawer.
 *
 * Dismissed by ESC or the close button — clearing selection.agenomeId
 * AND selection.candidateId. There is no backdrop scrim so the rest
 * of the dashboard stays interactive while the drawer is open.
 *
 * Rendered at document.body so it overlays the whole dashboard rather
 * than getting clipped by a parent's overflow.
 */
export function DetailDrawer(): JSX.Element | null {
  const state = useRunState();
  const { dispatch } = useRunStore();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const agenomeOpen = state.selection.agenomeId != null;
  const candidateOpen = state.selection.candidateId != null;
  const open = agenomeOpen || candidateOpen;

  // Close on ESC. Attached at the document level so the drawer still
  // closes when focus has wandered outside its content. The listener is
  // only registered while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dispatch({ kind: "SELECT_AGENOME", agenomeId: null });
        dispatch({ kind: "SELECT_CANDIDATE", candidateId: null });
      }
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

  const close = () => {
    dispatch({ kind: "SELECT_AGENOME", agenomeId: null });
    dispatch({ kind: "SELECT_CANDIDATE", candidateId: null });
  };

  return createPortal(
    <aside
      role="dialog"
      aria-label="Detail"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: "min(520px, 92vw)",
        background: "var(--doppl-bg-surface, #0e1424)",
        color: "var(--doppl-text-primary)",
        borderLeft: "1px solid var(--doppl-border)",
        boxShadow: "-12px 0 36px rgba(0, 0, 0, 0.35)",
        overflow: "auto",
        // Top padding leaves room for the close button to sit clear of
        // whatever PanelTitle the inspector renders.
        padding: "44px 20px 20px",
        zIndex: 1000,
      }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        aria-label="Close detail"
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
      {/* Mutual exclusion in the reducer means only one of these is
          ever rendered at a time. Agenome wins the tie-break that
          can't actually happen. */}
      {agenomeOpen ? <AgenomeInspector /> : <CandidateDetailInspector />}
    </aside>,
    document.body,
  );
}
