/**
 * runtime/demo — PD.4 demo-path building blocks (ARCHITECTURE.md §17). Two PURE modules, ZERO new
 * contract surface: the only-lowers cap-override helper (defense-in-depth over the authoritative route/
 * kernel clamp, rule #1) and the operator-driven in-memory fallback-ladder controller (manual advance,
 * no authoritative state). Consumed by PD.5 (write-path live-prompt config) + PD.6 (mode indicator).
 */
export { applyDemoCapOverride } from './demo-cap-override';
export {
  createFallbackLadder,
  type FallbackLadder,
  type FallbackLadderConfig,
  type DemoRungKind,
  type DemoMode,
  type RungDescriptor,
  type LowCapLiveRung,
  type PreparedRung,
  type ReplayRung,
} from './fallback-ladder';
