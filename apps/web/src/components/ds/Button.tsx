import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from 'react';

/**
 * Button — the brand's primary action primitive. Calm chrome; the accent "living cyan" is reserved
 * for the primary CTA. [MUTATING] actions (Start, Stop, Run live) use primary/danger; everything
 * else is secondary/ghost. TS-strict port of docs/doppl-design-system/components/core/Button.jsx —
 * adherence-clean (var() tokens only; the prototype's raw-px paddings → --space-* tokens).
 */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  children?: ReactNode;
  /** Visual weight. primary = accent fill, danger = stop/destructive. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** Optional leading glyph/icon (e.g. "▶", "■"). */
  glyph?: ReactNode;
  style?: CSSProperties;
}

/** Per-size geometry. fontSize/height/gap are bare numerics (layout); padding is on the --space grid. */
const SIZES = {
  sm: { fontSize: 13, padding: 'var(--space-1) var(--space-3)', height: 32, gap: 7 },
  md: { fontSize: 14, padding: 'var(--space-2) var(--space-4)', height: 40, gap: 8 },
  lg: { fontSize: 16, padding: 'var(--space-3) var(--space-5)', height: 48, gap: 9 },
} as const;

function variantStyle(variant: NonNullable<ButtonProps['variant']>): CSSProperties {
  switch (variant) {
    case 'secondary':
      return {
        background: 'var(--bg-surface-2)',
        color: 'var(--fg-default)',
        border: 'thin solid var(--border-strong)',
      };
    case 'ghost':
      return {
        background: 'transparent',
        color: 'var(--fg-muted)',
        border: 'thin solid transparent',
      };
    case 'danger':
      return {
        background: 'var(--danger)',
        color: 'var(--fg-on-accent)',
        border: 'thin solid var(--danger)',
      };
    case 'primary':
    default:
      return {
        background: 'var(--accent)',
        color: 'var(--fg-on-accent)',
        border: 'thin solid var(--accent)',
      };
  }
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  glyph,
  type = 'button',
  onClick,
  style,
  ...rest
}: ButtonProps) {
  const s = SIZES[size];
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        fontFamily: 'var(--font-ui)',
        fontSize: s.fontSize,
        fontWeight: 600,
        lineHeight: 1,
        padding: s.padding,
        minHeight: s.height,
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition:
          'background var(--motion-fast) var(--ease-out), transform var(--motion-fast) var(--ease-out)',
        ...variantStyle(variant),
        ...style,
      }}
      onMouseDown={(e: MouseEvent<HTMLButtonElement>) => {
        if (!disabled) e.currentTarget.style.transform = 'scale(0.97)';
      }}
      onMouseUp={(e: MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onMouseLeave={(e: MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {glyph != null && (
        <span aria-hidden="true" style={{ fontSize: '1.1em', lineHeight: 1 }}>
          {glyph}
        </span>
      )}
      {children}
    </button>
  );
}
