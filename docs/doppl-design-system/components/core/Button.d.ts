import * as React from "react";

/**
 * The brand action primitive. Accent "living cyan" is reserved for the primary CTA;
 * danger for destructive/stop actions; secondary/ghost for everything else.
 */
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  children?: React.ReactNode;
  /** Visual weight. primary = accent fill, danger = stop/destructive. */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Optional leading glyph/icon (e.g. "▶", "■"). */
  glyph?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Button(props: ButtonProps): React.JSX.Element;
