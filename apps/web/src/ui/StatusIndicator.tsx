import type { JSX } from "react";
import { type StatusDomain, type StatusShape, getStatusToken } from "./status-map.js";

/**
 * StatusIndicator (P7.3) — the only primitive every panel uses to
 * render status. Combines shape + icon + label + color so the visual
 * is redundant: screen readers, projector viewers, and colorblind
 * readers all get the same signal.
 */

export interface StatusIndicatorProps {
  domain: StatusDomain;
  status: string | undefined | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const SIZE_PX = { sm: 14, md: 20, lg: 28 } as const;

function ShapeSvg({
  shape,
  color,
  size,
}: { shape: StatusShape; color: string; size: number }): JSX.Element {
  const half = size / 2;
  switch (shape) {
    case "circle":
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={half} cy={half} r={half - 1} fill={color} />
        </svg>
      );
    case "square":
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <rect x={1} y={1} width={size - 2} height={size - 2} fill={color} />
        </svg>
      );
    case "triangle":
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <polygon points={`${half},1 ${size - 1},${size - 1} 1,${size - 1}`} fill={color} />
        </svg>
      );
    case "diamond":
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <polygon
            points={`${half},1 ${size - 1},${half} ${half},${size - 1} 1,${half}`}
            fill={color}
          />
        </svg>
      );
    case "hexagon": {
      const r = half - 1;
      const points = [0, 1, 2, 3, 4, 5]
        .map((i) => {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          return `${(half + r * Math.cos(angle)).toFixed(2)},${(half + r * Math.sin(angle)).toFixed(2)}`;
        })
        .join(" ");
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <polygon points={points} fill={color} />
        </svg>
      );
    }
    case "ring":
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={half} cy={half} r={half - 2} fill="none" stroke={color} strokeWidth={3} />
        </svg>
      );
  }
}

export function StatusIndicator(props: StatusIndicatorProps): JSX.Element {
  const token = getStatusToken(props.domain, props.status);
  const size = SIZE_PX[props.size ?? "md"];
  const showLabel = props.showLabel ?? true;
  return (
    <output
      aria-label={token.aria}
      title={token.label}
      className={props.className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        color: token.color,
        fontWeight: 600,
        fontSize: size <= 14 ? "14px" : "16px",
      }}
      data-status={props.status ?? "unknown"}
      data-icon={token.iconName}
    >
      <ShapeSvg shape={token.shape} color={token.color} size={size} />
      {showLabel && <span>{token.label}</span>}
    </output>
  );
}
