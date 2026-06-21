import { type JSX, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRunState, useRunStore } from "../state/runStore.js";
import { AgenomeInspector } from "./AgenomeInspector.js";

/**
 * AgenomeDetailModal — portal-mounted dialog that wraps AgenomeInspector.
 * Visible when state.selection.agenomeId is set, dismissed by ESC, by
 * clicking the backdrop, or by the close button. Dismiss dispatches
 * SELECT_AGENOME with null so the reducer clears the selection and the
 * mutual-exclusion guarantee from Task 1 still holds.
 *
 * Rendered at document.body so it overlays the whole dashboard rather
 * than getting clipped by a parent's overflow.
 */
export function AgenomeDetailModal(): JSX.Element | null {
  const state = useRunState();
  const { dispatch } = useRunStore();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const open = state.selection.agenomeId != null;

  // Close on ESC. Attached at the document level so the modal still
  // closes when focus has wandered out of the dialog content (e.g. an
  // ancestor's portal). The listener is only registered while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ kind: "SELECT_AGENOME", agenomeId: null });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  // Move keyboard focus to the close button on open so a screen-reader
  // or keyboard user lands inside the dialog rather than back wherever
  // they clicked.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const close = () => dispatch({ kind: "SELECT_AGENOME", agenomeId: null });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agenome detail"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8, 12, 24, 0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={close}
    >
      <div
        // Stop clicks inside the card from bubbling to the backdrop and
        // closing the modal.
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--doppl-bg-surface, #0e1424)",
          color: "var(--doppl-text-primary)",
          border: "1px solid var(--doppl-border)",
          borderRadius: 10,
          width: "min(720px, 92vw)",
          maxHeight: "86vh",
          overflow: "auto",
          padding: 20,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
          position: "relative",
        }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close agenome detail"
          onClick={close}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "transparent",
            border: "none",
            color: "var(--doppl-text-secondary)",
            fontSize: 20,
            cursor: "pointer",
            lineHeight: 1,
            padding: 6,
          }}
        >
          ×
        </button>
        <AgenomeInspector />
      </div>
    </div>,
    document.body,
  );
}
