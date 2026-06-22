# P5 Phase-Boundary Security Review — SELECTION track

- **Policy:** `phase-boundary` (dispatched at `/phase-exit`); `security-reviewer` Step-8 policy = `invariant`. This is the whole-system security pass for the phase.
- **Repo:** `/Users/dreddy/Documents/GauntletAI/Capstone-selection` · branch `track/selection` · HEAD `86e708d`
- **Base:** `cody` (`d9619ec`)
- **Verdict:** **CLEAR** — no findings (0 critical / 0 high / 0 medium / 0 low).

## Review surface (over-approximation note)

The accumulated branch diff `git diff cody...HEAD` over the selection seams + boot composition + on-loan kernel/demo edits:

```
apps/api/src/boot/composeRuntime.ts        | 157 ++  (new)
apps/api/src/boot/index.ts                 |   8 ++  (new)
apps/api/src/boot/startRun.ts              |  90 ++  (new)
apps/api/src/routes/runs.ts                |   9 ++  (on-loan, demo-territory)
apps/api/src/runtime/loop/generationLoop.ts|  52 ++  (on-loan, kernel-territory)
apps/api/src/runtime/worker/runWorker.ts   |   5 ++  (on-loan, kernel-territory)
apps/api/src/server.ts                     |   4 ++  (on-loan, demo-territory)
apps/api/src/selection/**                  |2476 ++  (new — 24 files)
31 files changed, 2802 insertions(+), 1 deletion(-)
```

This is the **phase's accumulated branch diff**, not a single slice diff. Because the selection track's earlier P5 slices (P5.2–P5.10 domain fns) also land in this range, the surface **over-approximates to the accumulated track diff** — accepted per the phase-boundary policy. Per-slice security reviews for these slices were all CLEAN; this pass re-cross-checks the wired-together whole against every safety invariant. CodeGraph was not indexed for this checkout (`.codegraph/` absent) — fell back to `Grep` + targeted `Read`; trust boundaries (POST /runs, ModelGateway, the append path) were traced by reading the seam + boot composition directly.

---

## Project safety-invariant pass (invariant-touching: YES)

Each of the 9 root-`CLAUDE.md` "Key safety rules" cross-checked against the diff. PASS = explicit no-violation per axis.

### Rule #1 — Caps are kernel-enforced, never prompt-enforced · **PASS**

Three clamp layers, all in runtime/boot code (never prompt text), no path raises a cap above the boot ceiling:

1. **Per-run-config clamp** (`boot/composeRuntime.ts:63-82` `mergePerRunConfig`): every one of the 6 caps overlaid as `Math.min(perRun.caps.X, boot.caps.X)`. A posted config can only *lower* within the boot ceiling. The clamped value is written to BOTH `config.caps` (the value the loop enforces at `generationLoop.ts:230`) AND `runConfig.caps` (consistency) — no split-cap divergence.
2. **The directly-appended `run.configured` bypass is closed.** `startRun.ts:15-24` `readRecordedConfig` reads the operator config back from the authoritative `run.configured` event and `RunConfig.safeParse`s it; it then flows through the SAME `mergePerRunConfig` min-clamp (`composeRuntime.ts:117-120`). So even a `run.configured` appended directly to the log (bypassing the route's 422 cap-override guard at `routes/runs.ts:111-114`) cannot raise a cap above the boot ceiling — the kernel clamp is downstream of and independent from the route defense. The route's 422 is a defense layer; the boot `min()` is the un-bypassable enforcer.
3. **Successor-population SIZE clamp** (`generationLoop.ts:518-532`): the `nextPopulation` hook return is treated as a HINT — `population = threaded.slice(0, caps.maxPopulation)`. An oversized hook return can never raise the population cap. Mirrors gen-0's `materializeGen0(..., caps.maxPopulation)` clamp at `generationLoop.ts:317-322`. Marked `[Human-authorized guardrail-#1 lift … kernel-territory file on loan]` in-comment.
4. **Per-child rule-#1 fields** (`selection/seams/successor-threading.ts:47-59` `rehome`): `parentIds.length ≤ 2` asserted (throws on violation), `spawnBudget` clamped via the kernel single-source `clampSpawnBudget(child.spawnBudget, caps.maxPopulation).effectiveSpawns`. `clampSpawnBudget` (`runtime/spawn/spawnBudgetClamp.ts:22-29`) is `min(hint, max(0, headroom))` reading only the two scalars — a trait can't widen it by shape.
5. **Allocation is a normalized hint** (`selection/allocation.ts:28-71` `allocate`): `Σ spawns ≤ remainingPopulation` by largest-remainder over `Math.max(0, remainingPopulation)`; degenerate all-zero-weight / empty-pool / zero-headroom → 0 spawns (no NaN / divide-by-zero / negative). `assembleSuccessor` (`selection/successor.ts:98-143`) realizes exactly `Σ allocation ≤ remainingPopulation`.

No cap is asserted in any prompt string. `SYNTHESIS_INSTRUCTION` (`fuse.ts:58-60`) carries no cap claim. Grep for cap/budget/limit terms in prompts: none.

### Rule #2 — Append-only authoritative event log · **PASS**

- All seam writes route through the injected `ctx.append` / `EventStore.append` only — `score-seam.ts:74,93,143`, `reproduce-seam.ts:126,139` (→ `assembleSuccessor` → `reproduce` → `fuse`/`degenerate` all emit via the threaded `emit`/`append`), `fuse.ts:146,215`, `degenerate.ts:70,87`. No direct table write.
- Grep `(insert|update|delete).*run_events` over `selection/`, `boot/`, `routes/runs.ts`: **NONE**.
- The POST /runs trigger (`routes/runs.ts:122-130`) appends exactly one `run.configured` event via `deps.store.append` (the P1.3 writer) — no in-place edit, no projection write. The `onRunConfigured` fire-and-forget callback appends nothing itself (`startRun.ts:52` — the worker/loop own all events).
- `successor-threading.ts` is read-only over the log (`ReproductionEvent.safeParse(row.payload)`, reconstruct in memory, return) and appends nothing — the loop owns all appends (`generationLoop.ts:516-517` comment + `nextPopulation` returns the population, never emits). A corrupt row → `continue` (never fabricates a child, `successor-threading.ts:78`).
- The `generation.completed` / lifecycle events the loop emits still go through `appendEvent` → `eventStore.append`. The successor hook fires AFTER `generation.completed` and only re-reads the log.

### Rule #3 — No arbitrary code execution · **PASS**

- Grep `eval\(|exec\(|child_process|require\(|new Function|vm\.` over `selection/` + `boot/`: only hit is `GENERATION_ID_PATTERN.exec(...)` (`successor-threading.ts:28`) — a `RegExp.prototype.exec` string match, not code execution. No `eval`/`new Function`/`vm`/dynamic `require`/`spawn` on any candidate- or model-derived input.
- Reproduction/scoring never executes candidate or model text — `applyMutation`/`applyFusion` reconstruct by string manipulation + `Agenome.parse`; the synthesis output becomes a `systemPrompt` *string field*, never invoked.

### Rule #4 — Secrets never leave the server · **PASS**

- No new payload/response path carries a secret. The 201 response is `{ runId }` only (`routes/runs.ts:136`); the idempotent path returns `{ runId, idempotent: true }` (`:86`); stop returns `{ runId, status, stopped }` (`:148,160`).
- Provider keys live only behind the `ModelGateway` port (rule #9 below); the seams hold a `ModelGateway` reference but never read or emit credentials. `EmbeddingResponseSchema` / `SynthesisSchema` narrow gateway output to `{vector,…}` / `{synthesis}` — no credential field representable.
- All event payloads still pass through the event-store append path's redaction scrub (P1.3, `EventStore.append`, unchanged here) — the seams append via that same writer, so the scrub-before-append boundary is preserved. No new bypass writer was introduced.
- Error responses are typed-shape (`invalid_config` / `cap_override_exceeds_max` / `run_already_active` / `run_not_found`) — no payload echo. `startRun.ts:75-88` `onError` is a logging hook (server stdout, outside the rule-#4 event-log/Langfuse/UI boundary) and is wrapped so a throwing hook can't crash the server.

### Rule #5 — Model output untrusted until schema-validated; candidate text is data, not instructions · **PASS**

- **Fusion synthesis** (`fuse.ts:160-172`): the only candidate/parent-text → model path. Parent systemPrompts reach the `fusion_synthesis` role ONLY inside `wrapUntrusted(...)` (the frozen sentinel-wrap from `@doppl/contracts`) in a SEPARATE `user` message; the instruction lives in the `system` message (`SYNTHESIS_INSTRUCTION`) and is byte-identical regardless of parent content. No template-string interpolation of parent text into an instruction string. Output is validated (`SynthesisSchema.safeParse`, `fuse.ts:183`); a rejected/unparseable output is DISCARDED (never persisted) and fusion degrades to crossover-only (`:184-190`).
- **Embedding** (`embed.ts:34-60`): candidate summary sent as the embedding `prompt`; output narrowed via `EmbeddingResponseSchema.safeParse` (`output` is `z.unknown()` on the frozen response). A rejected/malformed embedding → defined failure (`embedding_response_rejected`/`_malformed`), never a thrown secret or silent zero vector.
- Grep for template-literal interpolation of candidate/model text into a prompt instruction: none — the only interpolation (`fuse.ts:166-168`) is the parent material INSIDE `wrapUntrusted`, which is the correct data framing.

### Rule #6 — Held-out judge / rubric / scoring policy immutable to agents · **PASS**

- `DEFAULT_JUDGE_RUBRIC` (`verifier/judge/rubric.ts:82-96`) is a `deepFreeze`d in-code const (5-axis complete, `immutableToAgents:true`, `policyVersion:'final-judge-mvp-1'`). Source, not a runtime-writable file.
- **Single-source wiring** (`composeRuntime.ts:128,135`): the SAME `DEFAULT_JUDGE_RUBRIC` is injected to BOTH the verify seam (`rubricSource`) and the score seam (`rubric`) — so the score seam's `judgeAcceptance` policyVersion check (`components/judge-acceptance.ts:73`) matches the version the judge produced under; `judge_acceptance` is a present value, not a silent version-mismatch absence.
- **Not per-run overridable** (`mergePerRunConfig`, `composeRuntime.ts:63-82`): the overlay touches ONLY `caps`/`rngSeed`/`enabledSubtypes`. `scoringPolicy`, the judge rubric, and `seedSet` ride through by `...boot` reference — no genome/config-supplied rubric or policy override path exists. The `RunConfig` contract has no rubric field, so a posted/appended `run.configured` cannot carry one.
- **Read-verbatim, never recomputed** (`judge-acceptance.ts:84-95`): `value: judgeResult.acceptance` read verbatim, never re-derived from `axisScores`. The component additionally enforces the load gate `assertImmutableRubricLoaded` (`:41-52`, full-axis-set + `immutableToAgents===true`) and fails CLOSED on a misconfigured anchor. Selection reads the judge measurement; it never invokes/mutates the judge or rubric and exposes no path to do so. No agent-reachable write path to the rubric/policy in the entire diff.

### Rule #7 — Replay calls no providers · **PASS**

- **Successor-threading** (`successor-threading.ts:64-84`): reconstructs each child via `applyReproduction(pool, parsed.data)` reading the persisted `agenome.fused`/`agenome.reproduced` events from the log. No gateway, no rng — structurally provider-free.
- `applyReproduction` (`reproduction/reproduce.ts:100-116`) takes NO gateway param; dispatches to `applyMutation` (`mutate.ts:159-165`, reconstructs from persisted `mutationSummary`, no rng) or `applyFusion` (`fuse.ts:234-252`, no gateway param, reconstructs from persisted `crossoverPoints`+`mutationSummary`). Both replay reconstructors share the same `reconstructChild`/`reconstructFusedChild` builder as the live path → byte-identical by construction; both fail LOUD on a corrupted persisted event rather than coercing garbage.
- The reproduce/score SEAMS read their cross-subsystem inputs back from the persisted log (`readByRun`) — `score-seam.ts:78` reads once per run; `reproduce-seam.ts:127` projects from `scoredEvents` (rule #7 — read back, never recompute). `ctx.outcomes` (the loop's generic outcome source) is UNUSED by the reproduce seam — selection's RNG outcomes live in the persisted `ReproductionEvent`, not the loop's outcome log.
- The LIVE-only gateway touches (`embed` for novelty, `fuse`'s `fusion_synthesis` call) are on the score/reproduce LIVE path; the replay path (`applyReproduction`, `applyFusion`, `applyMutation`, `cosine` over the persisted vector) is gateway-free.
- Grep `Math.random|Date.now|new Date()` over `selection/`: only doc-comments asserting their absence. The PRNG (`reproduction/rng.ts`, mulberry32) is pure seeded — live-path determinism; replay never re-runs it.

### Rule #8 — Energy = successful productive spend only · **PASS** (no change to energy accounting)

- The selection seams emit NO `energy.spent` — score-seam comment (`:31`) + reproduce-seam comment (`:16-17`) both state reproduction/scoring energy is the kernel's debit. Grep confirms no `energy.spent` emit in `selection/`. Energy accounting is untouched by this diff (the loop's `debitEnergy`, `generationLoop.ts:259-293`, is unchanged on the success-only path).

### Rule #9 — Postgres only; provider SDKs only behind the ModelGateway · **PASS**

- Grep `from ['"](openai|@anthropic|@anthropic-ai|openrouter)` over `selection/` + `boot/`: **NONE**. No SQLite import/driver anywhere in the diff.
- The boot `toGenerationGateway` (`composeRuntime.ts:105-111`) is a thin port→port shim: it adapts the frozen `ModelGateway` port to the loop's `GenerationGateway` port (`generate: async (req) => ({ response: await modelGateway.call(req) })`) — no vendor type, no SDK, no domain leak. The selection seams hold only the `ModelGateway` port interface; `embed.ts` / `fuse.ts` call `gateway.call(...)` against the port (rule #9 / forbidden-pattern #2 honored).

---

## General security pass

- **Input validation** — POST /runs re-validates the body via `validateRunConfig` (`routes/runs.ts:101-108`, rejects non-object body at `:92-96` → 400), rejects cap overrides above the maxima (422, `:111-114`), and the boot trigger re-parses the recorded config via `RunConfig.safeParse` (`startRun.ts:22`). Defense-in-depth: route validation + boot re-parse + kernel clamp. No unvalidated boundary path introduced. PASS.
- **Authorization** — POST /runs is operator-initiated (`actor:'operator'`); no new privileged path beyond the existing route. The fire-and-forget trigger runs in-process under the same trust as the route. No new auth surface. PASS.
- **Injection** — no SQL/command/path-traversal/SSRF surface added; the only model-bound text goes through `wrapUntrusted` (rule #5). The `GENERATION_ID_PATTERN` regex (`successor-threading.ts:25`) is a fixed anchored pattern over a kernel-minted id (`${runId}-gen${g}`), not user input — fails LOUD on a non-matching id rather than mis-homing. PASS.
- **Unbounded loops / resource exhaustion** — successor-threading iterates the persisted log once (`for … of log`), bounded by the run's event count; reproduction loops are bounded by `Σ allocation ≤ remainingPopulation ≤ maxPopulation` and `schedule` length = `Σ allocation` (`successor.ts:118-140`). No loop over user-controlled unbounded length. The population is re-clamped each generation (`generationLoop.ts:531`). PASS.
- **Fire-and-forget error handling** — `createStartRun` (`startRun.ts:54-89`) wraps the worker chain in `.catch` so a rejection can't become an unhandled rejection that crashes the HTTP server; `onError`/`onSettled` hook bodies are individually try/caught so a throwing hook can't escape. The run's failure remains authoritative in the log (worker/crash-forward terminalizes `run.failed`). The 201 does not block on the run. PASS.
- **Integer over/underflow, signature/crypto, allowance races** — N/A (no arithmetic-as-currency, no signature path, no token-approval surface in this diff). The allocation math guards NaN/divide-by-zero/negative explicitly (`allocation.ts:39-42`). PASS.

---

## Disposition ledger

| Axis | Result |
|---|---|
| Rule #1 caps kernel-enforced | PASS |
| Rule #2 append-only log | PASS |
| Rule #3 no arbitrary code exec | PASS |
| Rule #4 secrets stay server-side | PASS |
| Rule #5 candidate text is data | PASS |
| Rule #6 judge/rubric/policy immutable | PASS |
| Rule #7 replay calls no providers | PASS |
| Rule #8 success-only energy | PASS (unchanged) |
| Rule #9 ModelGateway port only, no SDK | PASS |
| General: input validation / authz / injection / unbounded loops / fire-and-forget | PASS |

**Findings (Step-9 escalation):** none.
**Verdict:** **CLEAR** — phase-boundary security gate passes for the SELECTION track's P5 wiring round.
