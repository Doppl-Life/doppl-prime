import { type JSX, type ReactElement, cloneElement, useId } from "react";

/**
 * Tooltip — themed, glass HUD bubble shown on hover AND keyboard focus
 * (CSS :hover / :focus-within), so it's accessible without JS state.
 * The trigger child is cloned to add aria-describedby pointing at the
 * bubble. Wrap a single focusable/hoverable element.
 */
export interface TooltipProps {
  /** Tooltip text. If empty, the child is rendered untouched. */
  label: string;
  /** Where the bubble sits relative to the trigger. */
  placement?: "top" | "bottom" | "left" | "right";
  /** Lay the wrapper out as a block (for full-width rows) instead of inline. */
  block?: boolean;
  children: ReactElement;
}

export function Tooltip({ label, placement = "top", block, children }: TooltipProps): JSX.Element {
  const id = useId();
  if (!label) return children;
  const trigger = cloneElement(children, { "aria-describedby": id } as Record<string, unknown>);
  return (
    <span
      className="doppl-tip"
      data-placement={placement}
      style={{ display: block ? "block" : "inline-flex", position: "relative" }}
    >
      {trigger}
      <span role="tooltip" id={id} className="doppl-tip__bubble">
        {label}
      </span>
    </span>
  );
}
