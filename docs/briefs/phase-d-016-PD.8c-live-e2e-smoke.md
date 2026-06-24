# /tdd brief — live_e2e_demo_smoke_invariants

## Feature
PD.8c (PD.8, slice c) — the **PRIMARY/headline e2e demo smoke runs LIVE against real LLMs** (USER DECISION, 2026-06-23 via lead). Boot the real stack with `DOPPL_GATEWAY=live` at a **low cap**, drive a forward run to `run.completed`, and assert the demo's **safety/correctness INVARIANTS hold on a live run** (not exact model text — live is non-deterministic). Then **capture the fixture FROM the live run** and replay it to keep the rule-#7 invariant tested on the live-captured run. **Opt-in**: skips cleanly when provider keys are absent so `/preflight` + CI stay green keyless. The PD.8a creds-free smoke (`0245b46`) remains the keyless CI base + the primary rule-#7 replay coverage.

## Use case + traceability
- **Task ID:** PD.8 (slice c — the live headline e2e; the §16 "one low-cap live run" rehearsal elevated to the primary proof)
- **Architecture sections it implements:** `ARCHITECTURE.md §16` (demo rehearsal: one low-cap live run; the 10-min demo window), `ARCHITECTURE.md §17` (the live demo path: prepared/operator prompt → live SSE run → improvement → final surviving idea), `ARCHITECTURE.md §6` (the live ModelGateway — OpenRouter primary + direct-OpenAI embeddings), `ARCHITECTURE.md §5` (caps rule #1 + energy success-only rule #8 enforced by the kernel on a real run), `ARCHITECTURE.md §14` (rule #4 — no secret leaks into events/payloads on a live run), `ARCHITECTURE.md §10` (the selected-winner lineage node, via the PD.11 bridge).
- **USER DECISION (lead-relayed, 2026-06-23):** the primary e2e demo smoke runs LIVE against real LLMs (tradeoffs accepted: non-deterministic, costs $, needs keys, NOT a CI gate). **The 4 constraints (honor all):** (1) preserve rule-#7 coverage — a live run is a FORWARD run, so capture the fixture from it + replay to assert state-equivalence + zero-provider; (2) gate opt-in — skip cleanly keyless so /preflight + CI pass; (3) assert INVARIANTS, not exact outcomes; (4) low cap to bound cost+time and fit the §16 10-min window.
- **Env the live run needs (lead-flagged to the user):** `OPENROUTER_API_KEY` (REQUIRED — generation/critic/judge/fusion via the live gateway) · `OPENAI_API_KEY` (embeddings/novelty; without it novelty degrades but the run can still terminal) · `DOPPL_GATEWAY=live` · `DATABASE_URL`. No web-search key (retrieval checks skip gracefully).
- **Related context — build on (don't rebuild):**
  - `apps/api/src/main.ts` `bootApp` — the real boot (loadConfig → migrate → seed[absent for live] → crashForward → buildServer → listen); `selectGateway` returns the LIVE gateway when `DOPPL_GATEWAY=live` (PD.9 `createLiveGateway`, built lazily from env). For the live run there is NO seed fixture (it's a forward run) — `DOPPL_SEED_FIXTURE` absent → live boot.
  - `apps/api/test/integration/boot/main-boot.test.ts` + `apps/api/test/integration/demo/demo-e2e-smoke.test.ts` (PD.8a) — the real-PG boot/run harness pattern. PD.8c MIRRORS the boot+POST /runs+await-terminal flow but with the LIVE gateway (real selectGateway), not the recorded fake.
  - `apps/api/src/event-store/scripts/dump-replay.ts` (`dumpReplayToFile`/`buildReplayFixture`) — capture the live run's events to a fixture (the rule-#7 base).
  - The PD.8a `replay_calls_no_provider` + `replay_state_equivalence` assertions — REUSE the same replay-assertion shape on the live-captured fixture.
  - Caps/energy: the kernel enforces caps (rule #1, `capEnforcer`) + debits energy success-only (rule #8, `EnergyEvent` has no failure member; `provider_call_failed` debits nothing). The test ASSERTS these over the live run's persisted events.
  - Redaction: the scrub runs at the append boundary (rule #4); the test ASSERTS no key value appears in any persisted event/payload.

## Acceptance criteria (what "done" means)
- [ ] **Opt-in gate:** the live e2e suite SKIPS cleanly when `OPENROUTER_API_KEY` (and/or `OPENAI_API_KEY`) is absent/blank — `/preflight` and CI pass with NO keys and NO live call. When keys are present it RUNS as the headline smoke. (Gate mechanism: Step-2.5 Q1.)
- [ ] **Live forward run reaches terminal:** with `DOPPL_GATEWAY=live` + low caps, `bootApp` + a POST /runs (a demo problem) drives a real forward run that reaches `run.completed` within the bounded window. INVARIANT, not exact content.
- [ ] **Caps enforced (rule #1):** caps-consumed ≤ configured caps for every dimension over the live run's persisted events (the kernel clamped/enforced; an over-cap was never exceeded). Low caps are honored (recorded==executed).
- [ ] **Selected winner resolves (PD.11 bridge):** the live run's lineage projection has a `status:'selected'` candidate node (the run completed with a `finalIdeaRef`; the bridge derived it) — the §12 final-idea surface is non-empty on a LIVE run.
- [ ] **Energy success-only (rule #8):** every `EnergyEvent` corresponds to a successful productive call; any `provider_call_failed` (retry/repair/failure) debits NO energy (no `EnergyEvent` for it). Assert over the persisted log.
- [ ] **No secret leakage (rule #4):** NO `OPENROUTER_API_KEY`/`OPENAI_API_KEY`/`DATABASE_URL` VALUE appears in any persisted event/payload (nor in the captured fixture) — the scrub held on a live run. Assert by scanning the persisted events + the fixture for the live key values.
- [ ] **Capture-from-live + replay (rule #7 preserved):** the live run's events are captured via `dump-replay` → the captured fixture is replayed → asserts replay state-equivalence (canonical serialization) + ZERO provider calls on the replay path. (This keeps rule-#7 tested on the LIVE-captured run; the keyless CI base stays PD.8a.)
- [ ] **Low cost/time bound:** caps are small enough that the live run fits the §16 10-minute demo window (and bounds $). Document the chosen caps.
- [ ] **A documented command** (`pnpm -C apps/api test:smoke:live` or a tagged variant) so PD.8b's runbook references it; it skips keyless, runs live with keys.
- [ ] **Reuses existing invariant/safety tests; weakens none.** `/preflight` clean (keyless skip path).

## Wiring / entry point (Step 7.5)
The live e2e drives the REAL boot path (`bootApp` with `DOPPL_GATEWAY=live` → the real `selectGateway`/`createLiveGateway` → `runWorker` forward run) — the exact code the live demo runs, not a test-only path. Capture uses the production `dumpReplayToFile`; replay uses the production replay reader + projections. Confirm at Step 7.5 that the live path exercises `bootApp`/`selectGateway` (live mode), not a bespoke re-impl, and that the gate truly prevents any live call when keys are absent.

## Files expected to touch
**New:**
- `apps/api/test/integration/demo/live-e2e-smoke.test.ts` — the gated live forward-run invariant smoke + capture-from-live + replay assertion (real PG; LIVE gateway when keys present, skip keyless).

**Modified:**
- `apps/api/package.json` — a documented `test:smoke:live` script (skips keyless; runs live with keys) the runbook references.
- *(maybe)* `apps/api/test/integration/_support/` — a tiny `hasLiveKeys()` / live-gate helper if it clarifies the skip condition (flag at Step-2.5).

If implementation needs files beyond this list (e.g. a low-cap live RunConfig fixture), **flag at Step 2.5**.

## RED test outline (Step 2)
Integration (real PG) — `live-e2e-smoke.test.ts`, the whole suite `describe.skipIf(!hasLiveKeys)`:
1. **`live_run_reaches_terminal`** — boot live + low caps → POST /runs → await `run.completed`. Why: §17/§16 live demo-of-record.
2. **`live_run_enforces_caps`** — caps-consumed ≤ configured for all dimensions. Why: §5 rule #1.
3. **`live_run_resolves_selected_winner`** — lineage has a `status:'selected'` node (PD.11 bridge). Why: §10/§12 headline.
4. **`live_run_energy_success_only`** — `EnergyEvent`s ⟷ successful calls; `provider_call_failed` debits none. Why: §5 rule #8.
5. **`live_run_no_secret_leak`** — no live key VALUE in any persisted event/payload or the captured fixture. Why: §14 rule #4.
6. **`live_captured_fixture_replays_equivalent_no_provider`** — capture the live run (`dump-replay`) → replay → state-equivalence + zero-provider. Why: §4/§16 rule #7 on the live-captured run.

> Live = non-deterministic: assert INVARIANTS + STRUCTURE (terminal reached, a winner exists, caps/energy/secret invariants), NEVER exact candidate text or scores. NO mocks on the load-bearing path — the live gateway is real. Keyless → the whole suite skips (verify `/preflight` stays green).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. ZERO new contract surface (composes `bootApp`/live gateway/`dump-replay`/replay reader/projections).
- **Orchestrator doc rows to write hot (Step 9 routing):** an **Architecture-doc note** (§16/§17): the primary demo e2e is a live opt-in smoke asserting invariants; rule-#7 retained via capture-from-live + replay (creds-free PD.8a is the keyless CI base). The orch writes it.
- **§2.5-seam model touched?** No.
- **New script flag:** `test:smoke:live` in package.json — note at Step 9.

## Things to flag at Step 2.5
1. **Gate mechanism + "real key" detection.** `describe.skipIf(!process.env.OPENROUTER_API_KEY)` is the simple gate. Should it ALSO require `OPENAI_API_KEY` (for novelty) or run OpenRouter-only (novelty degrades)? My default vote: **gate on `OPENROUTER_API_KEY` present (required); run with whatever embedding key is present** — assert terminal + winner regardless; if `OPENAI_API_KEY` is absent, tolerate `novelty_scoring_degraded` (still a valid completed run). Skip the WHOLE suite if `OPENROUTER_API_KEY` is absent. Confirm.
2. **Low-cap values.** Need small population/generations that still reliably produce a scored-survivor winner within ~10 min + bounded $. My default vote: **maxPopulation ≈ 3–4, maxGenerations = 2, a bounded energyBudget** (≥2 generations so the evolution story shows; small enough to be cheap) — tune to what reliably reaches `run.completed` with a `finalIdeaRef`. Document the chosen caps. Flag if a single generation is more reliable.
3. **Captured-from-live fixture: commit it or keep it transient?** My default vote: **transient (temp dir, in-test)** — replay it for the rule-#7 assertion, do NOT auto-commit (the committed CI fixture stays the deterministic keyless `demo-recorded-001`; a live fixture is non-reproducible without keys + costs $ to regenerate). The operator can run `capture:demo-fixture` to commit a live fixture as the demo-of-record if desired (PD.8b's runbook documents the tradeoff). Flag if the user wants the committed fixture to BE a live capture.
4. **Can you EXECUTE the live path?** If your env has real keys, run it once + confirm the invariants pass + the capture/replay works, and report the outcome at Step 9. If NOT, build + verify the keyless-skip path (/preflight green) and FLAG at Step 9 that the live path is built-but-unexecuted pending the user's keys (the user/lead runs it). Either way the slice ships with the gate + invariants in place.

## Dependencies + sequencing
- **Depends on:** PD.9 (`createLiveGateway` / `DOPPL_GATEWAY=live`, shipped `da774b1`) · PD.10 (per-run problem into generation, shipped) · PD.11 (the selected-winner bridge, shipped `4607369`) · PD.8a (the boot/run harness + the replay-assertion shape, shipped `0245b46`) · the kernel caps/energy enforcement (P3).
- **Blocks:** PD.8b (the runbook + .env single-source the live command's final shape — that's why PD.8c precedes PD.8b) → `/phase-exit PD`.

## Estimated commit count
**1.** One focused slice (the gated live e2e + capture/replay + the script). Invariant-ASSERTING (it exercises caps/energy/redaction/winner) but introduces no new safety LOGIC — so it's atomic as one unit, not split. **Run `security-reviewer` at Step 8** (invariant policy — it touches the rule #1/#4/#8 surfaces; confirm the live keys never leak + the gate can't accidentally run a live call/leak in CI).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a live e2e asserts deterministic INVARIANTS (terminal · caps · winner-resolves · energy-success-only · no-secret-leak) over a non-deterministic live run, gated opt-in (skips keyless so CI/preflight stay green), and preserves rule-#7 by capturing the fixture FROM the live run + replaying it — the creds-free recorded smoke stays the keyless CI base."
- **Architecture-doc note candidate** — §16/§17: the headline demo proof is live opt-in; rule-#7 retained via live-capture+replay.
- **Future TODO — operational** — a committed live-captured fixture (if the user wants the demo-of-record to be a real run) is re-recorded via `capture:demo-fixture` with keys; document the cost/non-determinism tradeoff in the runbook.

## How to invoke
1. Read this brief + `main.ts` (bootApp/selectGateway live path) + PD.8a's `demo-e2e-smoke.test.ts` (the harness to mirror).
2. Run `/tdd live_e2e_demo_smoke_invariants` (`apps/api` hat; real-PG integration; LIVE gateway when keys present).
3. Step 0 (Restate) — confirm: live forward run, INVARIANTS not exact text, opt-in skip keyless, capture-from-live+replay for rule #7.
4. Step 2.5 — answer Q1–Q4 (gate, caps, fixture-commit, can-you-execute).
5. Step 8 — `security-reviewer` (invariant — live key handling + the CI gate).
6. Step 9 — report whether the live path was executed (keys present) or only the keyless-skip path was verified (flag pending keys).
