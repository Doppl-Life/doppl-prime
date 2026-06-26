import type { JSX } from "react";

/**
 * The single panel-title treatment used across the dashboard — a
 * compact, uppercase, tracked, muted label. Rendered as an <h2> so the
 * document keeps a real heading outline; the small-label look is purely
 * visual. Every panel (Problem, Final surviving idea, Fitness, Generation
 * comparison, Energy spend) uses this so their titles read as one family,
 * leaving the larger mixed-case content values (see PanelValue) to carry
 * the visual weight.
 */
export function PanelTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <h2
      style={{
        margin: "0 0 8px",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--doppl-text-secondary)",
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

/**
 * The content-value treatment for a panel's headline data — the problem
 * statement, the surviving-idea name. Large, bold, and mixed-case
 * (NOT uppercase) so it reads as content, never as another section title.
 */
export function PanelValue({
  children,
  title,
  style,
}: {
  children: React.ReactNode;
  title?: string;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <div
      title={title}
      style={{
        fontSize: "var(--doppl-fs-xl, 28px)",
        fontWeight: 700,
        lineHeight: 1.25,
        textTransform: "none",
        letterSpacing: "normal",
        color: "var(--doppl-text-primary)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
