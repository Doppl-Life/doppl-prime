# /tdd brief — seeded_rng_and_outcome_persistence

## Feature
The kernel's **single seeded RNG source** + the **live/replay outcome-persistence bridge** (P3.6) — the determinism substrate that makes every kernel non-deterministic decision (mutation field selection + magnitudes, parent-selection tie-breaks, fusion crossover points, any sampling) reproducible. `createSeededRng(seed)` is one deterministic, pure-JS PRNG owned by the kernel and derived from the per-run `RunConfig.rngSeed` (frozen P0.3, persisted in `run.configured`). The outcome bridge has two modes: **LIVE** draws from the seeded RNG and records each concrete outcome into a JSON-safe ordered log destined for the `agenome.mutated` / `agenome.fused` / `lineage.culled` payloads; **REPLAY** reads those persisted outcomes in order and **never constructs or advances the RNG** (key safety rule #7). SOLO determinism slice.

## Use case + traceability
- **Task ID:** P3.6 (user re-sequenced ahead of P3.4/P3.5 — ledger §G).
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (RNG / non-determinism capture — *"either (a) drawn from a per-run seed persisted in `run.configured` and reproduced deterministically on replay, or (b) its concrete outcome persisted in the `agenome.mutated` / `agenome.fused` / `lineage.culled` payloads. Replay reconstructs from persisted seed/outcomes and never re-samples"*; replay determinism / state-equivalence contract), `ARCHITECTURE.md §5` (the kernel owns RNG seeding; `run.configured (seed RNG, …)`; `agenome.fused / agenome.mutated (persist RNG outcomes)`).
- **Consumed (never redefined):** frozen `RunConfig.rngSeed` (`z.int().nonnegative()`, P0.3 — REQUIRED so the per-run PRNG seed is persistable in `run.configured`). **Distinct from `RunConfig.seed`** (the opaque problem-scenario STRING) — do not conflate; this slice consumes the numeric `rngSeed` only.
- **Pattern to mirror:** the replay reader (`apps/api/src/event-store/replay-reader.ts`, P1.8) enforces rule #7 **structurally** — it imports no provider/model/web seam. The REPLAY outcome source mirrors that: it imports no PRNG/provider seam, so replay re-sampling is impossible by construction.
- **Safety:** key safety rule #7 (replay calls no providers; reconstructs from persisted seed/outcomes, never re-samples). SOLO — never bundled (TDD posture + brief-template replay-determinism pitfall).

## Acceptance criteria (what "done" means)
- [ ] `createSeededRng(seed: number)` returns a **deterministic** stateful PRNG: same seed → identical draw sequence across two independent instances (byte-reproducible); the seed is normalized to the PRNG's domain **deterministically** (so a `RunConfig.rngSeed` outside uint32 range still maps to a stable, repeatable state — documented, not silently truncated to a colliding value at runtime).
- [ ] The PRNG is **pure-JS and self-contained**: no `Math.random`, no `crypto`, no `Date`/clock, no provider/model/web import. It is the kernel's **single** seeded source (`ad-hoc Math.random in lifecycle code is excluded from kernel decision-making`).
- [ ] `readRngSeed(runConfig)` extracts the numeric seed from the frozen `RunConfig` (the `run.configured` payload) — pinning that the kernel derives all sampling from the seed **persisted in `run.configured`**, not a fresh/ambient seed. (Round-trips a `run.configured`-shaped fixture payload.)
- [ ] **LIVE** outcome source: each draw calls the PRNG and **records the concrete outcome** into an ordered, JSON-safe log (`{label, value}` in draw order); `.outcomes()` returns the log destined for the `agenome.mutated`/`agenome.fused`/`lineage.culled` payload (open JSONB — no contract change).
- [ ] **REPLAY** outcome source: constructed **from a persisted outcome log only**; returns outcomes in draw order; **never constructs or advances the PRNG** (rule #7). Drawing past the log end, or a label mismatch against the persisted entry, throws loud (corruption is never silently re-sampled — mirrors the replay reader's validate-not-sort stance).
- [ ] **Equivalence (the §4 (a)≡(b) pin):** a deterministic draw sequence run LIVE from seed `S`, whose outcomes are captured, replays **byte-identically** through the REPLAY source over those captured outcomes — establishing that replay reconstructs from persisted seed/outcomes and the RNG is not advanced during replay.
- [ ] All unit tests in `apps/api/test/unit/runtime/rng/seededRng.test.ts` + `apps/api/test/unit/runtime/rng/persistOutcomes.test.ts` pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — emission wiring lands in P3.10 / P3.12.** P3.6 builds the substrate + the `readRngSeed` seam; it does not itself emit `run.configured` or the mutation/fusion/cull events (those are emitted by the run-configure/worker path **P3.12** and the generation loop **P3.10**). Exported from `apps/api/src/runtime/index.ts` (alongside the P3.2 guards). **First consumers (named, lesson 20):** P3.9 (gen-0 seed-agenome trait sampling), P3.10 (mutation field selection + magnitudes, parent-selection tie-breaks, fusion crossover points), reproduction-dispatch — each constructs the LIVE source from `createSeededRng(readRngSeed(config))` and embeds `.outcomes()` into the event it appends; replay/projection (P6/PD) constructs the REPLAY source from the persisted payload.

## Files expected to touch
**New:**
- `apps/api/src/runtime/rng/seededRng.ts` — `createSeededRng(seed)` + `readRngSeed(runConfig)`; the deterministic PRNG + its minimal draw API.
- `apps/api/src/runtime/rng/persistOutcomes.ts` — the LIVE recorder + REPLAY reader outcome sources over the shared draw interface.
- `apps/api/test/unit/runtime/rng/seededRng.test.ts`
- `apps/api/test/unit/runtime/rng/persistOutcomes.test.ts`

**Modified:**
- `apps/api/src/runtime/index.ts` — export `createSeededRng`, `readRngSeed`, the LIVE/REPLAY outcome sources + their types.

If implementation needs files beyond this list (e.g. a `runtime/rng/index.ts` barrel), flag at Step 2.5.

## RED test outline (Step 2)
`seededRng.test.ts`:
1. **`same_seed_yields_identical_sequence`** — two `createSeededRng(42)` produce the same first-N draw sequence. Asserts byte-reproducibility. Why: §4 "two runs same seed + same inputs → identical sampling sequences."
2. **`different_seed_diverges`** — distinct seeds diverge (sanity that the seed actually drives state, not a constant).
3. **`seed_normalized_deterministically`** — a `RunConfig.rngSeed` outside the PRNG's native domain (e.g. `2**32 + 7`, still a nonnegative int) maps to a **stable, repeatable** internal state (same big seed → same sequence on every construction). Why: §4 reproducibility + the frozen `rngSeed` is `z.int().nonnegative()` (unbounded above).
4. **`readRngSeed_extracts_from_run_config`** — `readRngSeed` pulls the numeric `rngSeed` off a `run.configured`-shaped `RunConfig` fixture (not `RunConfig.seed`, the problem-scenario string). Why: §4/§5 — seed persisted in `run.configured`.
5. **`prng_uses_no_ambient_nondeterminism`** — structural: the `seededRng` module imports no `Math.random`/`crypto`/`Date`/provider seam (grep/AST assertion over the module source). Why: rule #7 + "single seeded source; ad-hoc Math.random excluded."

`persistOutcomes.test.ts`:
6. **`live_records_outcomes_in_draw_order`** — LIVE source over a seeded RNG accumulates a JSON-safe ordered `{label,value}` log; `.outcomes()` is `JSON.parse(JSON.stringify(...))`-stable. Why: §4(b) outcomes persisted in payloads.
7. **`replay_returns_persisted_without_advancing_rng`** — REPLAY source constructed from a persisted log returns outcomes in order and **constructs no PRNG** (rule #7: RNG not advanced during replay). Structural: the REPLAY path imports no `seededRng`/provider seam.
8. **`replay_throws_on_overdraw_and_label_mismatch`** — drawing past the log end → throws; a label that disagrees with the persisted entry → throws (no silent re-sample / re-sort; mirrors `ReplayIntegrityError`).
9. **`live_then_replay_is_byte_identical`** — the equivalence pin: capture LIVE outcomes from seed `S` over a fixed draw script, replay them, assert identical value sequence. Why: §4 (a)≡(b) — replay reconstructs from persisted seed/outcomes, never re-samples.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **NONE.** Consumes frozen `RunConfig.rngSeed`; the outcome log rides the **open JSONB** payload of `run.configured`/`agenome.mutated`/`agenome.fused`/`lineage.culled` (none are in the P0.10 high-traffic narrowed payload-map → no contract touch).
- **Orchestrator doc rows to write hot:** none expected. Possible Architecture-doc note candidate: pin the concrete PRNG algorithm + seed-normalization rule into §4 (so replay across machines is byte-stable) — route at Step 9 if it lands as a load-bearing detail consumers depend on.
- **§2.5-seam model touched?** No — consumes the frozen `RunConfig`; no Appendix-A field set changes (no schema-snapshot test needed).

## Things to flag at Step 2.5
1. **PRNG algorithm + seed normalization.** A small, well-known deterministic generator with a 32-bit state (e.g. **mulberry32**) is the MVP default — pure integer ops + one IEEE-754 double division for `nextFloat`, byte-stable across V8 platforms, zero deps. `RunConfig.rngSeed` (nonnegative int, unbounded above) normalizes to the uint32 state via `seed >>> 0` (deterministic; document that seeds ≥ 2³² wrap — acceptable since it's stable+repeatable). My default vote: **mulberry32 + `seed >>> 0`**. Flag if you prefer a 53-bit generator (splitmix64-style) for a larger seed domain.
2. **Outcome-log shape: ordered list vs labeled map.** My default vote: **ordered `{label, value}[]` consumed in draw order** — order is the contract (matches "RNG not advanced during replay"), label is a corruption-check assertion, not a lookup key. Avoids label-collision ambiguity when the same kind of draw repeats.
3. **REPLAY source independence (rule #7 structural).** My default vote: the REPLAY source is a **separate construction that imports no `seededRng`** (mirroring the replay reader's no-provider-import discipline, §4 P1.8) — replay cannot instantiate the PRNG even by accident. Confirm you implement it as two types/factories, not one type with a mode flag that still pulls in the PRNG.
4. **Scope boundary — no event emission this slice.** My default vote: **yes, defer emission** of `run.configured` + mutation/fusion/cull events to P3.10/P3.12 (consumers unbuilt); P3.6 ships the substrate + `readRngSeed` seam + the LIVE/REPLAY sources. The acceptance bullets are unit-testable on the substrate without the unbuilt loop.
5. **Draw API surface.** My default vote: **minimal** — `nextUint32()`, `nextFloat()` (`[0,1)`), `nextInt(loInclusive, hiExclusive)`, `pick<T>(arr)`. Add `shuffle` only when P3.10 actually needs it (defer — YAGNI). Flag if you foresee an immediate consumer needing more.

## Dependencies + sequencing
- **Depends on:** P0.3 (`RunConfig.rngSeed` frozen) ✓ · P1.3 append path ✓ (the outcome log rides events the append path persists; P3.6 doesn't append directly). Needs **neither** P3.4 caps **nor** P3.5 energy.
- **Blocks:** P3.9 (seed-agenome sampling), P3.10 (mutation/fusion/tie-break sampling + outcome persistence), reproduction-dispatch; the replay-faithful in-flight experience (§4) downstream.

## Estimated commit count
**1.** SOLO determinism/safety slice (key safety rule #7) — gets its OWN commit, **never bundled** (TDD posture + brief-template replay-determinism pitfall). **security-reviewer in the loop** (policy: invariant — this is a rule-#7 replay-determinism substrate): focus the review on the structural no-re-sample-on-replay guarantee + no-ambient-nondeterminism in the PRNG. `feat(runtime)`.

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — the concrete PRNG algorithm + `seed >>> 0` normalization is the cross-machine byte-stability guarantee replay rests on; may warrant a one-line §4 pin so a future consumer doesn't swap the generator and silently break older replays.
- **Convention candidate** — "replay re-sampling is prevented *structurally* (the REPLAY source imports no PRNG), not by a runtime flag" — extends the replay-reader rule-#7 structural-enforcement lesson to the RNG substrate.

## How to invoke
1. **Read this brief end-to-end** + skim `event-store/replay-reader.ts` for the rule-#7 structural-import discipline this mirrors.
2. **Run `/tdd seeded_rng_and_outcome_persistence`** in the implementer session.
3. **Step 0/1** — confirm restatement + file list.
4. **Step 2.5** — send the per-test write-up + coverage map; answer the 5 design questions (algorithm + seed normalization is the load-bearing one).
5. **Step 9** — flag the §4 algorithm/normalization note if it lands load-bearing; surface anything unexpected.
