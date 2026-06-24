/**
 * ds/ — the Doppl design-system component vocabulary, hand-translated TS-strict from
 * docs/doppl-design-system/components (never imports the prototype .jsx). This barrel is the
 * canonical import surface FV.1+ (router + screens) consume. The reconciled StatusBadge + ModeBanner
 * are re-exported from their in-place homes (core/ + feedback/) so existing imports stay unchanged.
 */
export { Button } from './Button';
export type { ButtonProps } from './Button';

export { Meter } from './Meter';
export type { MeterProps } from './Meter';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { LoadingState } from './LoadingState';
export type { LoadingStateProps } from './LoadingState';
export { ErrorState } from './ErrorState';
export type { ErrorStateProps } from './ErrorState';
export { DegradedState } from './DegradedState';
export type { DegradedStateProps } from './DegradedState';

export { CandidateCard } from './CandidateCard';
export type { CandidateCardProps, CandidateSummary } from './CandidateCard';
export { AgenomeCard } from './AgenomeCard';
export type { AgenomeCardProps, AgenomeSummary } from './AgenomeCard';

export { ActivityTicker } from './ActivityTicker';
export type { ActivityTickerProps, TickerEvent } from './ActivityTicker';
export { HealthIndicator } from './HealthIndicator';
export type { HealthIndicatorProps, HealthStatus, HealthSummary } from './HealthIndicator';
export { RunEnergyGauge } from './RunEnergyGauge';
export type { RunEnergyGaugeProps } from './RunEnergyGauge';

// Reconciled in place (FV.0) + re-exported here so ds/ is the one canonical surface.
export { StatusBadge } from '../core/StatusBadge';
export type { StatusBadgeProps } from '../core/StatusBadge';
export { ModeBanner, deriveMode } from '../feedback/ModeBanner';
export type { ModeBannerProps, ModeBannerMode } from '../feedback/ModeBanner';
