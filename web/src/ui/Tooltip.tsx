import {
  type CSSProperties,
  type JSX,
  type ReactElement,
  cloneElement,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Tooltip — themed glass HUD bubble shown on hover AND keyboard focus.
 *
 * The bubble is rendered in a portal on document.body with fixed
 * positioning, so it escapes scrolling/overflow ancestors (e.g. the
 * sidebar's overflow:auto) instead of being clipped. Position is
 * computed from the trigger wrapper's bounding rect.
 */
export interface TooltipProps {
  /** Tooltip text. If empty, the child is rendered untouched. */
  label: string;
  placement?: "top" | "bottom" | "left" | "right";
  /** Lay the wrapper out as a block (for full-width rows) instead of inline. */
  block?: boolean;
  children: ReactElement;
}

const GAP = 8;

export function Tooltip({ label, placement = "top", block, children }: TooltipProps): JSX.Element {
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    switch (placement) {
      case "bottom":
        setPos({ top: r.bottom + GAP, left: r.left + r.width / 2 });
        break;
      case "right":
        setPos({ top: r.top + r.height / 2, left: r.right + GAP });
        break;
      case "left":
        setPos({ top: r.top + r.height / 2, left: r.left - GAP });
        break;
      default:
        setPos({ top: r.top - GAP, left: r.left + r.width / 2 });
    }
  }, [placement]);

  const hide = useCallback(() => setPos(null), []);

  if (!label) return children;

  const transform = {
    top: "translate(-50%, -100%)",
    bottom: "translate(-50%, 0)",
    right: "translate(0, -50%)",
    left: "translate(-100%, -50%)",
  }[placement];

  const bubbleStyle: CSSProperties = pos
    ? { position: "fixed", top: pos.top, left: pos.left, transform }
    : {};

  const trigger = cloneElement(children, {
    "aria-describedby": pos ? id : undefined,
  } as Record<string, unknown>);

  return (
    <span
      ref={wrapRef}
      className="doppl-tip"
      style={{
        display: block ? "flex" : "inline-flex",
        // Don't let a flex/grid parent stretch the wrapper to full width,
        // or right/left tooltips anchor to the far container edge.
        alignSelf: "flex-start",
        width: "fit-content",
        maxWidth: "100%",
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {trigger}
      {pos &&
        createPortal(
          <span role="tooltip" id={id} className="doppl-tip__bubble" style={bubbleStyle}>
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
