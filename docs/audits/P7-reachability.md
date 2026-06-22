# P7 Reachability Audit — `apps/web/` (demo track, branch `track/demo`)

**Date:** 2026-06-22  
**Phase:** P7 exit gate  
**Scope:** All of `apps/web/src/**` (apps/web did not exist at the demo fork point; accumulated P7 diff ≈ the whole tree — this over-approximates to the full source as documented for phase-boundary audits).  
**Most-recent slice:** P7 sv5 — `apps/web/src/components/core/status-map.ts` added `generation.degraded` + `candidate.repairing`.

---

## Production entry point

```
main.tsx
  → App (createRunClient + <Dashboard>)
    → routes/Dashboard.tsx  (the full panel shell)
      → dashboardWiring.wireRunStream  (SSE-store IoC)
      → state/runStore.createRunStore  (ViewState pub-sub)
      → state/reducer / state/resync   (fold + resync)
      → data/runClient / data/sseStream / data/contracts / data/errors / data/health
      → components/feedback/ModeBanner
      → components/run/RunConfigPanel  → runConfigForm
      → components/run/StopControl     → runControl
      → lineage/LineageGraph           → lineageToFlow / layout / inFlight / nodeTypes
      → charts/FitnessOverTime         → chartData / chartTheme
      → charts/GenerationComparison    → chartData / chartTheme
      → panels/EnergyPanel             → energyData
      → panels/FinalIdeaPanel          → finalIdeaData
      → panels/CandidateInspector
      → panels/CriticGauntletPanel     → criticData / evidenceRef
      → panels/SubtypeCheckPanel       → checkData
      → components/core/StatusBadge    → status-map
```

---

## Exports audited — 97 total

### REACHABLE (90)

| Symbol | File | Reached via |
|---|---|---|
| `App` | `App.tsx` | `main.tsx` (root mount) |
| `Dashboard`, `DashboardProps` | `routes/Dashboard.tsx` | `App` |
| `wireRunStream`, `WireRunStreamOptions` | `routes/dashboardWiring.ts` | `Dashboard` |
| `createRunStore`, `RunStore`, `RunStoreOptions` | `state/runStore.ts` | `Dashboard` |
| `applyEvent`, `foldEvents`, `emptyViewState`, `ViewState`, `RunMode`, `EntityView`, `EntityKind`, `isFailureEvent` | `state/reducer.ts` | `runStore` (consumed via import) |
| `resyncFromRest`, `assertValidCursor`, `pollOnce` | `state/resync.ts` | `runStore.resync` / `runStore.poll` |
| `createRunClient`, `RunClient`, `RunClientOptions`, `FetchLike`, `FetchResponseLike`, `FetchRequestInit`, `PayloadValidationError` (re-export), `TransportError` (re-export) | `data/runClient.ts` | `App` → `Dashboard` |
| `createSseStream`, `applyEnvelope`, `foldEvents`, `emptyFoldState`, `FoldState`, `SseStream`, `SseStreamOptions`, `EventSourceLike` | `data/sseStream.ts` | `Dashboard` + `dashboardWiring` |
| `PayloadValidationError`, `TransportError`, `parseOrThrow` | `data/errors.ts` | `runClient` + `sseStream` |
| `RunHealth` (schema + type) | `data/health.ts` | `runClient.getRunHealth` → `Dashboard` |
| All 17 re-exported contracts | `data/contracts.ts` | `runClient`, `sseStream`, `panels/*`, `lineage/*` |
| `resolveStatus`, `StatusDomain`, `StatusSpec`, `NEUTRAL_SPEC`, `STATUS_MAP` | `components/core/status-map.ts` | `StatusBadge` → `CandidateInspector`, `StopControl`, `nodeTypes`, `lineageToFlow` |
| `StatusBadge`, `StatusBadgeProps` | `components/core/StatusBadge.tsx` | `StopControl`, `CandidateInspector`, `FinalIdeaPanel`, `nodeTypes` |
| `ModeBanner`, `ModeBannerProps`, `ModeBannerMode` | `components/feedback/ModeBanner.tsx` | `Dashboard` (JSX + type import) |
| `RunConfigPanel`, `RunConfigPanelProps` | `components/run/RunConfigPanel.tsx` | `Dashboard` |
| `RunConfigFormValues`, `CapKey`, `CAP_CEILING`, `DEFAULT_FORM`, `clampCap`, `validateForm`, `buildRunConfig`, `FieldErrors`, `ValidationResult` | `components/run/runConfigForm.ts` | `RunConfigPanel` |
| `StopControl`, `StopControlProps` | `components/run/StopControl.tsx` | `Dashboard` |
| `RUN_TERMINAL_TYPES`, `isRunTerminal`, `selectRunStatus`, `StopControlPhase`, `StopControlInput`, `StopControlState`, `deriveStopControlState` | `components/run/runControl.ts` | `StopControl` + `Dashboard` (selectRunStatus) |
| `LineageGraph`, `LineageGraphProps` | `lineage/LineageGraph.tsx` | `Dashboard` |
| `lineageToFlow`, `pickFreshestProjection`, `LineageRfNodeType`, `LineageNodeData`, `LineageRfNode`, `LineageRfEdge`, `FlowGraph` | `lineage/lineageToFlow.ts` | `LineageGraph` |
| `layoutGraph` | `lineage/layout.ts` | `LineageGraph` |
| `deriveInFlight`, `InFlightOperation`, `ActivityEntry`, `InFlightState` | `lineage/inFlight.ts` | `LineageGraph` |
| `LineageNodeCard`, `AgenomeNode`, `CandidateNode`, `CriticCheckNode`, `ScoreNode`, `SelectedWinnerNode`, `GenerationNode`, `lineageNodeTypes` | `lineage/nodeTypes.tsx` | `LineageGraph` (`lineageNodeTypes` → React Flow `nodeTypes` prop; individual node functions are entries in that map) |
| `deriveFitnessSeries`, `FitnessSeriesPoint`, `GenerationComparisonPoint` | `charts/chartData.ts` | `FitnessOverTime` / `GenerationComparison` |
| `MARKER_GLYPH`, `SeriesStyle`, `BEST_FITNESS_SERIES`, `BEST_NOVELTY_SERIES`, `MarkerShape` | `charts/chartTheme.ts` | `FitnessOverTime` / `GenerationComparison` |
| `FitnessOverTime`, `FitnessOverTimeProps` | `charts/FitnessOverTime.tsx` | `Dashboard` |
| `GenerationComparison`, `GenerationComparisonProps` | `charts/GenerationComparison.tsx` | `Dashboard` |
| `EnergyPanel`, `EnergyPanelProps` | `panels/EnergyPanel.tsx` | `Dashboard` |
| `deriveEnergyByAgenome`, `energyBudgetProgress`, `AgenomeEnergyRow`, `EnergyBudgetProgress` | `panels/energyData.ts` | `EnergyPanel` |
| `CriticGauntletPanel`, `CriticGauntletPanelProps` | `panels/CriticGauntletPanel.tsx` | `Dashboard` |
| `deriveReviewsByCandidate`, `CriticReviewValue` | `panels/criticData.ts` | `CriticGauntletPanel` + `finalIdeaData` |
| `SubtypeCheckPanel`, `SubtypeCheckPanelProps` | `panels/SubtypeCheckPanel.tsx` | `Dashboard` |
| `deriveChecksByCandidate`, `CheckResultValue` | `panels/checkData.ts` | `SubtypeCheckPanel` + `finalIdeaData` |
| `FinalIdeaPanel`, `FinalIdeaPanelProps` | `panels/FinalIdeaPanel.tsx` | `Dashboard` |
| `selectWinner`, `gatherProof`, `LineageNodeValue`, `TraceRef`, `WinnerProof` | `panels/finalIdeaData.ts` | `FinalIdeaPanel` + `Dashboard` (selectWinner) |
| `EvidenceRefLink`, `EvidenceRefValue` | `panels/evidenceRef.tsx` | `CriticGauntletPanel`, `SubtypeCheckPanel`, `CandidateInspector` |
| `CandidateInspector`, `CandidateInspectorProps` | `panels/CandidateInspector.tsx` | `Dashboard` |

**Notes on specific symbols:**

- `NEUTRAL_SPEC` and `STATUS_MAP` — consumed internally by `resolveStatus` within `status-map.ts`; `STATUS_MAP` is also referenced directly in tests. In production `resolveStatus` is what callers import. Both constants participate in the production execution path via `resolveStatus` (they are not merely test-only).
- `LineageNodeCard` — exported and consumed internally by the individual node-type functions within `nodeTypes.tsx` (`AgenomeNode`, etc. all call `<LineageNodeCard …>`), and those are registered in `lineageNodeTypes` which is used by `LineageGraph`. REACHABLE in production.
- `isFailureEvent`, `EntityKind`, `EntityView` — these are used internally within `reducer.ts` on the production fold path. Their export is test-accessible too, but the symbol itself lives on the production path.
- `assertValidCursor` — called internally by `resyncFromRest`; REACHABLE on the resync path.
- `buildRunConfig` — called internally by `validateForm` inside `runConfigForm.ts`; REACHABLE via `RunConfigPanel`.
- `pollOnce` — alias of `resyncFromRest`; consumed by `runStore.poll`. REACHABLE.

### sv5 reconcile specifically (`generation.degraded`, `candidate.repairing`):

Both new entries in `STATUS_MAP` at `apps/web/src/components/core/status-map.ts` lines 53 and 99 are reachable via:

`resolveStatus('candidate', 'repairing')` / `resolveStatus('generation', 'degraded')` → called by `StatusBadge` → consumed by `CandidateInspector`, `StopControl`, `FinalIdeaPanel`, `nodeTypes.tsx` — all mounted by `Dashboard` → `main.tsx`.

The test at `test/unit/components/status-map.test.ts` exercises these entries directly, but the production path reaches them whenever a live run emits the corresponding event types and the status is rendered by `StatusBadge`.

---

### UNREACHABLE (7 — production-file exports with no production caller)

| # | File:line | Symbol | Currently referenced from | Recommended entry point | Notes |
|---|---|---|---|---|---|
| 1 | `apps/web/src/charts/chartTheme.ts:36` | `MEAN_FITNESS_SERIES` | None (defined, not imported by any production file) | `FitnessOverTime.tsx` — add mean-fitness overlay series to the chart; or `GenerationComparison.tsx` | The `FitnessSeriesPoint.mean` and `GenerationComparisonPoint.meanFitness` data fields are already computed by `deriveFitnessSeries`/`deriveGenerationComparison` and carry the mean values, so the data is wired; only the *rendering* constant is unused. |
| 2 | `apps/web/src/charts/chartTheme.ts:48` | `MEAN_NOVELTY_SERIES` | None (defined, not imported by any production file) | `GenerationComparison.tsx` — add mean-novelty bar series | Same situation as above. |
| 3 | `apps/web/src/components/feedback/ModeBanner.tsx:33` | `deriveMode` | Test only — `test/unit/components/ModeBanner.test.tsx:6` | `routes/Dashboard.tsx` — replace the local `bannerMode` helper with the exported `deriveMode` (they are equivalent; `Dashboard` uses an inline private `bannerMode` function instead of the exported one; or the route shell could import `deriveMode` directly) | Non-blocking: the intent is covered by the inline `bannerMode`; `deriveMode` accepts `RunStatus` (frozen enum) while the local function accepts `string | undefined` — a minor type difference. The gap has no production impact but the export goes unused. |
| 4 | `apps/web/src/components/run/runControl.ts:18` | `RUN_TERMINAL_TYPES` | Test only — `test/unit/components/run/runControl.test.ts` | `StopControl.tsx` or any direct caller of `isRunTerminal` | Non-blocking: `isRunTerminal` is reachable (it calls `RUN_TERMINAL_TYPES.has` internally); the *exported set constant* itself is never imported by a production file. It is an implementation detail exposed as a named export for test-inspection. |
| 5 | `apps/web/src/components/run/runControl.ts:25` | `isRunTerminal` | Only via `deriveStopControlState` internally within `runControl.ts`; never directly imported by a production consumer | `StopControl.tsx` already reaches it indirectly via `deriveStopControlState`. The export itself has no direct production importer. | Non-blocking: it is on the production execution path (called inside `deriveStopControlState` which is imported by `StopControl`). The export is test-accessible but the function is reachable in production. **Reclassify as REACHABLE-via-internal-call** — listed here because no production module directly `import`s it, but it executes on the production path via `deriveStopControlState`. |
| 6 | `apps/web/src/state/reducer.ts:48` | `isFailureEvent` | Only called internally within `reducer.ts:76` (`applyEvent`); no external production importer | `applyEvent` path in `runStore` | Non-blocking: same as `isRunTerminal` above — executes on the production path inside `applyEvent`; the export is for test inspection only. **Reclassify as REACHABLE-via-internal-call**. |
| 7 | `apps/web/src/state/resync.ts:10` | `assertValidCursor` | Only called internally within `resyncFromRest` in `resync.ts:30`; no external production importer | `resyncFromRest` path via `runStore.resync` | Non-blocking: same pattern — executes on the production path, exported for test assertion of the guard behaviour. **Reclassify as REACHABLE-via-internal-call**. |

---

## Reclassification after internal-call review

After reviewing items 5–7: all three (`isRunTerminal`, `isFailureEvent`, `assertValidCursor`) are exported production utilities called within their own modules on the live execution path. They are not "exported-but-never-run-in-production." They are **REACHABLE** — the export is a test-seam pattern, not dead code. Removing them from the unreachable count.

**True unreachable exports (no production execution path): 4**

| # | Symbol | File | Status |
|---|---|---|---|
| 1 | `MEAN_FITNESS_SERIES` | `apps/web/src/charts/chartTheme.ts:36` | UNREACHABLE — export defined; no production file imports it |
| 2 | `MEAN_NOVELTY_SERIES` | `apps/web/src/charts/chartTheme.ts:48` | UNREACHABLE — export defined; no production file imports it |
| 3 | `deriveMode` | `apps/web/src/components/feedback/ModeBanner.tsx:33` | UNREACHABLE — test only; Dashboard uses a local equivalent `bannerMode` |
| 4 | `RUN_TERMINAL_TYPES` | `apps/web/src/components/run/runControl.ts:18` | UNREACHABLE — test inspection only; `isRunTerminal` is the production callable |

---

## Recommended wiring tasks

**Item 1 — `MEAN_FITNESS_SERIES` / `MEAN_NOVELTY_SERIES`** (low priority, cosmetic)  
Entry point: `apps/web/src/charts/FitnessOverTime.tsx` and/or `apps/web/src/charts/GenerationComparison.tsx`. The mean data is already computed; the styling constants just need to be imported and used to add a mean-series line/bar to the chart renderings. Belongs to a future chart-polish slice (no phase assigns this; it was likely intentionally deferred as the charts show best-only for the demo).

**Item 2 — `deriveMode`** (very low priority, cleanup)  
Entry point: `apps/web/src/routes/Dashboard.tsx`. Import and use `deriveMode` in place of the local `bannerMode` function. The type mismatch (`RunStatus` vs `string | undefined`) needs a minor adjustment. Not a feature gap — the functionality is present and working; this would be a cleanup consolidation.

**Item 3 — `RUN_TERMINAL_TYPES`** (informational)  
No wiring task needed. The constant is an implementation detail properly exported for test inspection of the terminal set. It is used at runtime via `isRunTerminal`. This is an accepted test-seam pattern.

---

## Summary for orchestrator

- **97 exported symbols audited across 39 production source files**
- **REACHABLE: 93** (90 direct + 3 via internal-call / test-seam)
- **TRULY UNREACHABLE: 4** (2 chartTheme mean-series constants, 1 `deriveMode`, 1 `RUN_TERMINAL_TYPES`)
- All 4 unreachable exports are **non-blocking**: they are style/convenience constants or a test-seam export; no production feature requires them. The dashboard mounts and runs all panels end-to-end without them.
- **sv5 status-map entries** (`generation.degraded`, `candidate.repairing`) are REACHABLE — both flow through `resolveStatus` → `StatusBadge` → panel components mounted by the Dashboard shell.
- **Phase-exit gate: CLEAR**
- 2 cosmetic wiring tasks recommended (mean-series rendering); 0 tasks are blocking.
