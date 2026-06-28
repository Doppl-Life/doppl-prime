/**
 * RunEnergyGauge — the run-wide energy budget as a filling charge: the visible "this is finite by
 * construction" signal (RunCaps.energyBudget). Segmented meter FILLS with spend (lit = consumed/budget)
 * + mono spent/budget; color tracks remaining and warns as the run nears its cap. Thresholds
 * nominal / warning (<30% left) / critical / exhausted.
 * TS-strict port of docs/doppl-design-system/components/observatory/RunEnergyGauge.jsx
 * (adherence-clean — var() tokens; segment geometry is bare numerics, EXEMPT per LESSONS §5/§6).
 */
export interface RunEnergyGaugeProps {
  spent: number;
  budget: number;
  mode?: 'live' | 'replay';
  showLabel?: boolean;
  unit?: string;
}

const SEGMENTS = 12;

export function RunEnergyGauge({
  spent,
  budget,
  mode = 'live',
  showLabel = true,
  unit = 'doppl_energy',
}: RunEnergyGaugeProps) {
  const remaining = budget > 0 ? Math.max(0, Math.min(1, 1 - spent / budget)) : 0;
  const consumed = budget > 0 ? Math.max(0, Math.min(1, spent / budget)) : 0;
  // Color tracks how much budget is LEFT (warns as the run nears exhaustion); the bar FILLS with spend.
  const color =
    remaining <= 0
      ? 'var(--energy-empty)'
      : remaining < 0.1
        ? 'var(--energy-low)'
        : remaining < 0.3
          ? 'var(--energy-mid)'
          : 'var(--energy-full)';
  // At least one segment lights once any energy is spent, so a small spend never reads as empty.
  const litCount = spent > 0 ? Math.max(1, Math.round(consumed * SEGMENTS)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)' }}>
      <span aria-hidden="true" style={{ color, fontSize: 15 }}>
        ⚡
      </span>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const lit = i < litCount;
          return (
            <span
              key={i}
              style={{
                width: 6,
                height: 16,
                borderRadius: 2,
                background: lit ? color : 'var(--energy-empty)',
                boxShadow:
                  lit && remaining >= 0.3 && mode === 'live' ? 'var(--glow-energy)' : 'none',
              }}
            />
          );
        })}
      </span>
      {showLabel && (
        <span style={{ fontSize: 13, color: 'var(--fg-default)' }}>
          {spent.toLocaleString()} / {budget.toLocaleString()}{' '}
          <span style={{ color: 'var(--fg-faint)' }}>{unit}</span>
        </span>
      )}
    </div>
  );
}
