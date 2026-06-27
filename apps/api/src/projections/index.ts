/**
 * projections barrel — the demo-track read-side foundation (P6.1, ARCHITECTURE.md §9). Exposes the
 * generic ordered-fold builder (`buildProjection` + `canonicalize`) and the watermark / staleness
 * primitive (`isStale` + `latestSequence`) that every concrete projection — P6.2 (current-state),
 * P6.3 (lineage), P6.4 (replay-summary) — and the P6.7/P6.8 read endpoints build on. Pure +
 * rebuildable: nothing here calls a model / web / embedding provider (rule #7).
 */
export * from './projection-builder';
export * from './watermark';
export * from './current-state';
export * from './lineage-graph';
export * from './research-notes';
export * from './replay-reader';
export * from './replay-summary';
export * from './run-list';
export * from './run-summary';
export * from './run-health';
