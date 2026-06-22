import React from "react";

/**
 * Button — the brand's primary action primitive. Calm chrome; the accent
 * "living cyan" is reserved for the primary call to action. [MUTATING] actions
 * (Start, Stop, Run live) use primary/danger; everything else is secondary/ghost.
 */

const SIZES = {
  sm: { fontSize: 13, padding: "6px 12px", height: 32, gap: 7 },
  md: { fontSize: 14, padding: "9px 16px", height: 40, gap: 8 },
  lg: { fontSize: 16, padding: "12px 22px", height: 48, gap: 9 },
};

function variantStyle(variant) {
  switch (variant) {
    case "secondary":
      return { background: "var(--bg-surface-2)", color: "var(--fg-default)", border: "1px solid var(--border-strong)" };
    case "ghost":
      return { background: "transparent", color: "var(--fg-muted)", border: "1px solid transparent" };
    case "danger":
      return { background: "var(--danger)", color: "#1a0608", border: "1px solid var(--danger)" };
    case "primary":
    default:
      return { background: "var(--accent)", color: "var(--fg-on-accent)", border: "1px solid var(--accent)" };
  }
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  glyph,
  onClick,
  type = "button",
  style,
  ...rest
}) {
  const s = SIZES[size] || SIZES.md;
  const v = variantStyle(variant);
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: s.gap, fontFamily: "var(--font-ui)", fontSize: s.fontSize, fontWeight: 600,
        lineHeight: 1, padding: s.padding, minHeight: s.height,
        borderRadius: "var(--radius-md)", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background var(--motion-fast) var(--ease-out), transform var(--motion-fast) var(--ease-out)",
        ...v,
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      {...rest}
    >
      {glyph && <span aria-hidden="true" style={{ fontSize: "1.1em", lineHeight: 1 }}>{glyph}</span>}
      {children}
    </button>
  );
}
