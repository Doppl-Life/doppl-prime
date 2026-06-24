# Phase-D — Whole-System Security Review (phase-boundary)

- **Dispatch:** `/phase-exit` phase-boundary security pass — branch `phase-d`, worktree `/Users/dreddy/Documents/GauntletAI/Capstone-phased`.
- **Reviewer:** security-reviewer (own pass; CodeGraph + targeted Read).
- **Verdict:** **CLEAR** — 0 critical / 0 high / 0 medium / 0 low. No Step-9 Finding.
- **Policy:** security-reviewer = `invariant`; this is the holistic phase-exit pass (the whole-system security row for Phase D).

## Scope note — over-approximation (stated per dispatch)

The review surface is the **accumulated Phase-D track diff** (`git merge-base main phase-d`..`phase-d`).
The raw merge-base predates the entire `apps/api` tree, so the literal diff over-approximates to the
whole backend. I narrowed to the actual Phase-D slices by commit and reviewed those plus their
trust boundaries; pre-existing surfaces in untouched files are noted as out-of-scope where relevant.

**Phase-D slices reviewed (commits):**
PD.1 dump-replay (`c8102a4`) · PD.2 seed-demo loader (`86d62de`) · PD.3 boot-spine + stop-path +
seed completion (`f330475`/`b5ada03`/`2788ba8`) · PD.4 demo cap-override + fallback-ladder
(`303900c`/`e2fc1f0`) · PD.5a/5b problem-sets + operator panel (`65b2496`/`9465013`) · PD.6 run-health
panel (`b61afa5`) · PD.7 final-idea panel (`1277cd1`) · PD.9 live gateway wiring (`da774b1`) ·
PD.10 per-run problem isolation + output validation (`8337e59`/`c88bb4a`) · PD.11 winner bridge
(`4607369`) · PD.8a creds-free e2e + committed fixture (`0245b46`) · PD.8c live opt-in e2e + keyless
mirror (`baf4d14`) · PD.8b single-sourced `.env.example` + drift-guard (`0949283`).
Per-slice reviews were CLEAN (PD.4/PD.10/PD.11/PD.8a/PD.8c/PD.8b).

This pass targets **cross-slice** issues a per-slice review can't see: does the live gateway introduced
in PD.9 + the committed env template (PD.8b) + the live e2e (PD.8c) compose into any new secret-leak
surface? does the demo cap-override (PD.4) + the per-run problem path (PD.10) + the web write surface
(PD.5) compose into a cap-bypass or injection path? do the new write paths (seed-demo, stop) respect
append-only holistically?

---

## Project safety-invariant pass

(`invariant_touching: yes` — Phase D wires the live gateway, an env template, demo cap controls, the
per-run problem into generation, and new boot/seed write paths. Every rule cross-checked explicitly.)

### Rule #4 — Secrets never leave the server — **PASS**

The live path is the new surface. Holistic trace:

- **Key is env-only, never persisted.** `createOpenRouterClient(env)` reads `OPENROUTER_API_KEY`
  from env and closes it over the SDK instance (`apps/api/src/model-gateway/adapters/openrouter.adapter.ts:223-229`,
  pre-existing). `createLiveGateway` (`live-gateway.ts:38-52`) injects that client and composes it into the
  SAME `createGateway` shell — it imports no SDK and exposes no vendor/credential type. `selectGateway`
  (`stub/fake-gateway.ts:90-104`) and `resolveGateway` (`main.ts:120-130`) only build live deps when
  `DOPPL_GATEWAY=live` and pass the client/registry; the key never enters a `ModelGatewayRequest`,
  `ModelGatewayResponse`, event payload, or AppConfig.
- **Scrub knows the live key values at the persistence boundary.** Boot constructs the event store with
  `secretValues: collectSecretValues(env)` covering `OPENROUTER_API_KEY`/`OPENAI_API_KEY`/`DATABASE_URL`
  (`main.ts:51,134-138,172`) — so the append-boundary scrub redacts the live key even if a future payload
  path carried it. The live e2e asserts this empirically: `secretValueLeaked(liveRows, liveSecrets)` and
  the captured-fixture scan both assert `false` (`live-e2e-smoke.test.ts:274-277`).
- **`.env.example` carries placeholders only.** All three creds are `REPLACE_ME` / `…REPLACE_ME@…`
  (`.env.example:12-14`). The drift-guard asserts the PLACEHOLDER-POSITIVE guard as load-bearing
  (`env_example_credentials_are_placeholders_not_secrets`,
  `test/unit/config/env-example-drift.test.ts:65-82`): every credential row must match the PLACEHOLDER
  regex (load-bearing) AND must not match the real-key-shape heuristic. The real-key-shape leg is
  non-vacuously guarded (`REAL_KEY_SHAPE.test('sk-or-v1-…')` asserted `true`, line 71).
- **Known boundary (LESSONS §95) — confirmed acceptable.** The `REAL_KEY_SHAPE` heuristic
  (`\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b`) is blind to a `DATABASE_URL` password and to non-`sk`-prefixed
  keys. This is fine because the **PLACEHOLDER-POSITIVE assertion is the load-bearing guard** — a real
  secret in any cred row fails the `PLACEHOLDER.test(value) === true` assertion regardless of its shape
  (a real DB URL or odd-prefixed key would not contain `REPLACE_ME`/`REPLACE`/`CHANGEME`/`your-`/
  `example`/`placeholder`). The shape regex is a secondary, best-effort tripwire. Not a finding.
- **No real `.env` committed.** `git ls-files` shows only `.env.example` tracked; `.gitignore:24-25`
  ignores `.env` + `.env.*`; `git check-ignore .env` confirms.
- **Committed fixture is secret-free.** `fixtures/replay/demo-recorded-001.json` carries no
  `sk-/pk-/rk-`-shaped string, no `Bearer`/`api_key`, and zero occurrences of the recorded placeholder
  values (`or-placeholder-not-used`/`oai-placeholder-not-used`) — the recorded gateway never persists
  them and the dump's `secretValues:[]` is sound (scrub ran at append-time, LESSONS §86).
- **Keyless CI cannot leak / cannot run live.** `describe.skipIf(!hasLiveKeys())` wraps the entire live
  block; the inner `beforeAll` that calls `bootApp({env: liveEnv})` + `fetch` lives INSIDE the gate
  (`live-e2e-smoke.test.ts:202,210,220`). The outer `beforeAll` (line 153) only sets up the PG admin
  pool — no key material, no live call. Keyless, only the recorded-fixture mirror runs.

### Rule #1 — Caps kernel-enforced, never prompt-enforced — **PASS**

- **Demo cap-override only LOWERS, within validated maxima.** `applyDemoCapOverride`
  (`runtime/demo/demo-cap-override.ts:14-34`) rejects any override `> maxima[key]` (throws, names the
  field, cites rule #1) and any non-positive value, then re-validates the result via `RunCaps.parse`
  (closes NaN/float/coercion). It shares the exact `> maxima` boundary with the route's `overCapField`
  (`routes/runs.ts:52-57,116-120` → 422) and defers to the kernel as sole authority (LESSONS §89).
- **Fallback-ladder cannot raise caps or carry a 2nd authority.** `createFallbackLadder`
  (`runtime/demo/fallback-ladder.ts`) computes rung-1 caps once via `applyDemoCapOverride(maxima,…)`,
  freezes the descriptors, holds NO event-store capability, and switching rungs mutates only an in-memory
  `activeKind`. The prepared rung's `RunConfig` flows through the normal write path (route + kernel clamp).
- **Successor-population hint clamped (rule #1).** The PD-adjacent `nextPopulation` hook return is sliced
  to `caps.maxPopulation` in the loop (`generationLoop.ts:562`) — an oversized hint can never raise the cap.
- **Live e2e asserts caps enforced.** `live_run_enforces_caps` + `recorded_fixture_enforces_caps` assert
  `generationsRun ≤ maxGenerations`, `maxPopulationObserved ≤ maxPopulation`,
  `totalEnergySpent ≤ energyBudget` (`live-e2e-smoke.test.ts:116-122,255-261`).

### Rule #2 — Append-only authoritative event log — **PASS**

- **seedDemo is INSERT-only + idempotent + validated.** `seedDemo` (`event-store/scripts/seed-demo.ts:117-135`)
  performs the single `.insert(runEvents).onConflictDoNothing` under the append-only trigger that allows
  INSERT but blocks UPDATE/DELETE/TRUNCATE (LESSONS §87); each fixture event is validated vs the frozen
  `RunEventEnvelope` + per-type `validateEventPayload` BEFORE insert (closes the restore-bypasses-append
  gap, §46), ordering re-validated through `replayEvents`, schemaVersion gated `≤ current`. The only two
  `.insert(runEvents)` sites in the whole tree are the canonical append writer (`append.ts`, in a txn) and
  this bounded restore — confirmed by diff scan; no UPDATE/DELETE/in-place historical edit anywhere in PD.
- **Stop / fallback-switch writes nothing authoritative.** `POST /runs/:id/stop` (`routes/runs.ts:145-164`)
  signals the in-memory `operatorStop` latch and returns 202/200/404 — it appends NOTHING; the worker
  terminalizes `run.stopped` via the append path (LESSONS §85). `createOperatorStopRegistry`
  (`boot/operatorStop.ts`) is a pure in-memory `Set`, no store. Switching demo rungs mutates nothing.
- **Winner bridge is a pure projection.** `winnerReducer` (`projections/reducers/winner.ts`) derives the
  `'selected'` status from the authoritative `run.completed.finalIdeaRef` — a pure SET in the current-state
  fold, never an authoritative write; no-op when the ref is absent or the candidate is unmaterialized
  (rule #6 — never fabricates). Imports only contracts types + `./state` (no provider/IO).
- **REST + web write surface unchanged in posture.** `POST /runs` appends the sole `run.configured`; the
  web `runClient` exposes only the contract endpoints (read projections + 2 idempotent commands), imports
  no `apps/api` internals, mutates no projection.

### Rule #3 — No arbitrary code execution — **PASS**

No new check-runner, no `eval`/`new Function`/`child_process`/`execSync`/`spawnSync`/`vm`/dynamic
`require` in any Phase-D src line (diff scan returned none). The demo/boot/seed paths introduce no
execution surface; candidate-derived input is never executed.

### Rule #5 — Candidate text is data, never instruction — **PASS**

- **Per-run problem reaches generation only as `wrapUntrusted` DATA.** `buildPopulationRequest`
  (`generationLoop.ts:49-61`) puts the agenome `systemPrompt` + the fixed, trusted
  `GENERATION_ISOLATION_FRAMING` in the `system` message and the operator/prepared problem
  (`config.runConfig.seed`) in a separate `user` message wrapped by the FROZEN contracts `wrapUntrusted`
  (LESSONS §38/§91) — never interpolated into the instruction string; a forged sentinel is neutralized.
- **Model output is schema-validated before use.** The request carries `schema: CandidateContent`
  (`candidateContent.ts`) — a strict, subtype-discriminated `CandidateIdea.omit(KERNEL_ASSIGNED)` — so the
  gateway runs validate/repair(≤1)/reject; a malformed output is REJECTED → graceful `agenome.failed`,
  never accepted-then-appended.
- **Web seed is data end-to-end.** `operatorPromptForm.buildDemoSeed` trims the prepared/freeform text into
  `RunConfig.seed`; `startDemoRun({seed})` posts the partial config — the seed never becomes an instruction
  on the client or the server. The held-out judge path is untouched (rule #6 preserved).

### Rule #6 — Immutable held-out judge / rubric / scoring policy — **PASS**

No Phase-D code adds an agent- or genome-reachable write to the judge, rubric, or scoring policy. The
winner bridge consumes the kernel's authoritative `finalIdeaRef` and the web final-idea panel presents
the kernel's `'selected'` winner without re-ranking (LESSONS §8/§11). The per-run problem feeds only the
`population_generator` call (judge untouched, §91).

### Rule #7 — Replay calls no providers — **PASS**

- **Seed/replay path is provider-free.** `seedDemo` + `dumpReplayToFile` import no provider seam (rule #7
  structural, LESSONS §86/§87). The creds-free e2e injects a `countingGateway` that throws if ever called
  and asserts `providerCalls() === 0` on the boot→seed→replay path (`demo-e2e-smoke.test.ts:184-186`).
- **Live capture→replay preserves rule #7.** The live e2e captures FROM the live run then replays the
  fixture with NO gateway: `replayEvents(capturedRows)` does not throw and `buildCurrentState`/
  `buildReplaySummary` reconstruct state-equivalent (`live-e2e-smoke.test.ts:281-289`). Replay re-folds the
  persisted log; the projection/replay modules import no provider (pinned elsewhere by
  `replay-summary.test.ts test_replay_imports_no_provider`).

### Rule #8 — Energy debited only on successful productive calls — **PASS**

- **Success-only is structural + asserted.** The loop debits `energy.spent` only on accepted productive
  calls (`generationLoop.ts:467-472` llm on accept; spawn/tool on success); a failed/rejected call emits
  `provider_call_failed` with NO energy debit (`generationLoop.ts:425-447`). The frozen `EnergyEvent` has
  no failure member (rule #8 by shape, LESSONS §9/§49). The live e2e asserts every `energy.spent` is a
  valid `EnergyEvent` and the total is within `energyBudget` (`live_run_energy_success_only` +
  the caps assertion).

### Rule #9 — No SQLite; SDKs only behind ModelGateway — **PASS**

No SQLite import/driver/connection string in any Phase-D line (Postgres only). The OpenRouter SDK stays
behind `createOpenRouterClient` / the `OpenRouterClient` seam; `createLiveGateway` and `selectGateway`
import no SDK and expose no vendor type (`live-gateway.ts:21-23`). No provider SDK import in any
runtime/projections/selection/verifier file (diff scan returned none).

---

## General security pass

- **Input validation (boundary paths):** `POST /runs` validates the body (rejects non-object, fail-fast
  `validateRunConfig`, 422 on over-cap). `GET /problem-sets` is read-only over the injected catalog (no
  store/db). The web client Zod-validates every server payload before view state. **No finding.**
- **Path traversal (new file-read/write surface):** `assertSafeRunId` (`scripts/runId-guard.ts`) rejects
  any runId containing `/`, `\`, `\0`, `.`, `..`, or empty BEFORE the seed/dump read/write — the demo seed
  can never escape `fixtures/replay/`. Web IDs percent-encoded. **No finding.**
- **SSRF / external href:** the live gateway only reaches the configured OpenRouter base URL via the SDK;
  no candidate-derived URL is fetched. The dashboard constructs no external `<a href>` (EvidenceRef
  rendered in-tier, LESSONS §7). **No finding.**
- **Information disclosure:** boot/loadConfig errors name the missing var, never echo a value
  (`main.ts:30,260-262`); the authoritative append path never echoes payload (LESSONS §26). The 5xx error
  handler sanitizes to `internal_error` (LESSONS §56, pre-existing). The static "Secret redaction active"
  UI indicator renders no secret. **No finding.**
- **Resource exhaustion / unbounded loops:** generation bounded by maxGenerations/maxPopulation +
  wall-clock + energy caps (kernel-enforced); the fallback-ladder has no timer/subscription; the seed
  restore is bounded by the committed fixture size; payload-DoS ceiling enforced at append (LESSONS §16).
  Live e2e capped at maxPopulation 3 / maxGenerations 2 with a 600s budget. **No finding.**
- **Injection (string-concat-to-system):** the per-run problem is the only new untrusted string into a
  prompt and it is `wrapUntrusted`-isolated (rule #5). No SQL string-concat (parameterized/drizzle). **No finding.**

---

## Disposition ledger (all checks, escalated + clean)

| Axis | Verdict | Evidence |
|---|---|---|
| Rule #4 secrets (live key env-only) | PASS | live-gateway.ts:38-52; openrouter.adapter.ts:223-229 |
| Rule #4 secrets (boot scrub wiring) | PASS | main.ts:51,134-138,172 |
| Rule #4 secrets (.env.example placeholders) | PASS | .env.example:12-14; env-example-drift.test.ts:65-82 |
| Rule #4 secrets (placeholder-positive is load-bearing, §95 boundary) | PASS (acceptable) | env-example-drift.test.ts:71-80 |
| Rule #4 secrets (no .env committed) | PASS | git ls-files; .gitignore:24-25 |
| Rule #4 secrets (fixture secret-free) | PASS | fixtures/replay/demo-recorded-001.json scan |
| Rule #4 secrets (keyless CI gate) | PASS | live-e2e-smoke.test.ts:37-40,202,210,220 |
| Rule #1 caps (override only-lowers) | PASS | demo-cap-override.ts:14-34; routes/runs.ts:52-57,116-120 |
| Rule #1 caps (ladder no 2nd authority) | PASS | fallback-ladder.ts |
| Rule #1 caps (live e2e asserts) | PASS | live-e2e-smoke.test.ts:116-122,255-261 |
| Rule #2 append-only (seedDemo INSERT-only) | PASS | seed-demo.ts:117-135 |
| Rule #2 append-only (stop/fallback no auth write) | PASS | routes/runs.ts:145-164; operatorStop.ts; fallback-ladder.ts |
| Rule #2 append-only (winner pure projection) | PASS | projections/reducers/winner.ts |
| Rule #3 no-exec | PASS | diff scan (no eval/exec/vm/child_process) |
| Rule #5 injection (problem as wrapUntrusted DATA) | PASS | generationLoop.ts:49-61; operatorPromptForm.ts |
| Rule #5 injection (output schema-validated) | PASS | candidateContent.ts; generationLoop.ts:425-448 |
| Rule #6 immutable judge/rubric | PASS | no agent/genome write path in PD |
| Rule #7 replay no providers (seed/replay) | PASS | demo-e2e-smoke.test.ts:184-186 |
| Rule #7 replay no providers (live capture→replay) | PASS | live-e2e-smoke.test.ts:281-289 |
| Rule #8 energy success-only | PASS | generationLoop.ts:425-472; live-e2e-smoke.test.ts:269 |
| Rule #9 no SQLite / SDK behind gateway | PASS | live-gateway.ts:21-23; diff scan |
| General: input validation | PASS | routes/runs.ts; runClient.ts |
| General: path traversal | PASS | runId-guard.ts |
| General: SSRF / external href | PASS | LESSONS §7 |
| General: info disclosure | PASS | main.ts:260-262; LESSONS §26/§56 |
| General: resource exhaustion | PASS | kernel caps + LESSONS §16 |

## Conclusion

**CLEAR.** No critical/high/medium/low finding; no Step-9 Finding to escalate. The Phase-D live-gateway,
env-template, demo-control, per-run-problem, and new boot/seed write paths compose cleanly against all
nine key safety rules and the general security axes. The single noted boundary (the `.env.example`
real-key-shape heuristic's blindness, LESSONS §95) is covered by the load-bearing placeholder-positive
assertion and is not a finding. The security row for the Phase-D phase-exit checklist records **CLEAR**.
