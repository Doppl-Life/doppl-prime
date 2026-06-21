# Phase 0 (contract freeze) — consolidating security review

- Track: `contract` · Branch: `track/contract` · Dispatch policy: `phase-boundary` (security row)
- Review surface: accumulated branch diff vs `main` over `packages/contracts/src` (37 files, +2055; effectively the full contracts file set — no prior baseline on this branch). This over-approximation is acceptable and noted.
- Tests: `pnpm test` → **45 files / 158 tests, all green** (839ms).
- Verdict: **CLEAR** — no safety pin weakened. No Finding.

This is a consolidating sweep, not a re-litigation. Per-slice security-reviewer CLEAN was already recorded for P0.2 / P0.6 / P0.7 / P0.8 / P0.9 / P0.10 / P0.15. This pass confirms the pins still HOLD as frozen in the accumulated diff and that no later slice silently weakened an earlier one.

## Safety-pin cross-check (all PASS)

| Pin | Rule | File | Verdict |
|---|---|---|---|
| Check-runner non-executing by shape | #3 | `checks/check-runner-adapter.ts` | PASS |
| Allowlist own-property gate, fail-safe skip | #3 | `checks/check-runner-adapter.ts` · `checks/check-result.ts` | PASS |
| Critic injection-isolation (trusted/untrusted fields) | #5 | `verifier/critic-input.ts` | PASS |
| `wrapUntrusted` single-pass-complete neutralization | #5 | `verifier/critic-input.ts` | PASS |
| Held-out judge immutable-by-shape | #6 | `verifier/final-judge-rubric.ts` | PASS |
| ScoringPolicy / FitnessScore immutability-via-versioning | #6 | `scoring/scoring-policy.ts` · `scoring/fitness-score.ts` | PASS |
| EnergyEvent success-only, no debit-on-failure field | #8 | `domain/energy-event.ts` · `events/event-type.ts` | PASS |
| `scrubSecrets` nested + idempotent; no credential surface | #4 / §14 | `security/redaction.ts` · gateway/* | PASS |
| `enforcePayloadCeiling` depth-before-size, never-throws, pinned | P0.10 | `events/payload-map.ts` | PASS |
| Caps kernel-enforced; `spawnBudget` clamped hint | #1 | `run/run-caps.ts` · `domain/agenome.ts` | PASS |
| Append-only authoritative envelope (shape) | #2 | `events/envelope.ts` | PASS |
| Replay outcomes persisted, no re-sample field | #7 | `domain/reproduction-event.ts` | PASS |
| Postgres-only; no SDK in contracts | #9 | (grep sweep) | PASS |

## Detailed findings per requested pin

### Rule #3 — no arbitrary code execution
- `CheckRunnerAdapter` is a `z.strictObject` of pure descriptor fields (`id`, `checkType`, `subtype?`, `label?`). Any code-carrying field (`exec`/`command`/`handler`/`fn`/`script`/`code`) is **unrepresentable** — strict-object rejects unknown keys. Grep across `src/` found zero such fields in any schema; the only `code:` hits are Zod `superRefine` issue codes, not schema fields.
- `resolveCheckAdapter` gates by `Object.prototype.hasOwnProperty.call(registry, id)` then a `!== undefined` guard — defeats `__proto__` / `constructor` / `toString` allowlist-bypass. NEVER executes, NEVER throws. Unregistered → `skipped` with a **fixed** `skipReason: 'unregistered_adapter'` (untrusted id never reflected into the reason).
- `CheckStatus` closed 3-member union; `CheckResult` ties `skipReason` IFF `skipped` (a skip is always reasoned; a non-skip can't carry one). Fail-safe is complete and well-formed. **PASS.**

### Rule #5 — candidate text is data, not instructions
- `criticInput` models `rubric` (trusted: `mandate` + `instructions`) and `candidate` (untrusted string) as distinct, non-conflatable strict fields at both levels. No interpolation surface in the contract.
- `wrapUntrusted` neutralizes every embedded `CRITIC_INPUT_SENTINEL` via `replaceAll` to `[neutralized-sentinel]` (the marker contains `[`, a char absent from the sentinel; the sentinel has no self-overlap → single-pass replacement is provably total, output holds the sentinel exactly twice for ANY input). Forged-boundary smuggling is closed. **PASS.**

### Rule #6 — immutable held-out judge / rubric / scoring policy
- `FinalJudgeRubric` stacks four immutability legs: closed `FinalJudgeAxis` enum (no agent-added axis), `immutableToAgents: z.literal(true)` (can't be set false or omitted at the boundary), required `policyVersion`, and a strict object that admits **no** `mutable`/`editableBy`/`scoreOverride`/`weightOverride`/`agentWritable`/authority field. Only `weights` VALUES are deferred-open (an open name→number record), matching ARCHITECTURE.md §7.
- `ScoringPolicy` + `FitnessScore` enforce immutability-via-versioning: `FitnessScore.policyVersion` is required and typed identically to `ScoringPolicy.version` (`z.string().min(1)`), binding every score to the exact policy. No in-place-mutation field. **PASS.**

### Rule #8 — energy = successful productive spend only
- `EnergyEventType` is a closed 3-member union (`llm`/`tool`/`spawn`) with **no failure member**. `EnergyEvent` is strict and carries **no** failure/retry/repair/success-debit field — unrepresentable.
- A failed call is a separate event: `provider_call_failed` is a first-class member of the closed `RunEventType` registry, distinct from `energy.spent`. Debit-on-failure is structurally impossible. **PASS.**

### §14 — secret redaction + no credential surface
- `scrubSecrets` recurses objects + arrays (verified by `recurses_nested_objects_and_arrays` + the `no_secret_in_output_corpus` sweep), is idempotent (`REDACTION_PLACEHOLDER` matches no secret pattern; `idempotent_double_scrub` green), pure/non-mutating (`does_not_mutate_input`), and prototype-pollution-safe: output is built on a normal-prototype object via `Object.defineProperty`, so a `__proto__` payload key round-trips as own DATA without polluting `Object.prototype` (`preserves_proto_data_key` green). Key-as-secret leak closed with O(n)-amortized de-collision (`decollision_scales_linearly` @ 20k keys). Value-patterns are word-boundary + length-gated (no dictionary-word corruption).
- Env-value layer is correctly NOT in the contracts package (§9 env-less) — it's applied at the boundary where env loads (event-store before append, observability before Langfuse emit), per ARCHITECTURE.md §14 line 361.
- No credential field anywhere on the gateway seam: `ModelGatewayRequest`, `ModelGatewayResponse`, `ProviderMeta`, `ModelRoute` are all strict objects with no `apiKey`/`secret`/`token`/`bearer`/`credential` field (grep: zero hits). Strict-object makes a credential-bearing field unrepresentable. **PASS.**

### P0.10 — payload ceiling
- `enforcePayloadCeiling` runs **depth-before-size** (load-bearing): `exceedsDepth` is a bounded, non-recursive explicit-stack DFS that returns the instant a node deeper than `MAX_PAYLOAD_DEPTH` is popped — so a pathologically deep / circular attacker payload yields `max_depth` in ~maxDepth steps and can never stack-overflow `JSON.stringify` (which only runs on a depth-safe payload). The whole body is `try`-wrapped: unserializable input (BigInt, throwing accessor) → `max_bytes` violation, never propagated — **never throws**. Constants (`1_048_576` / `32`) are literal-pinned by a snapshot test. **PASS.**

## General security pass
- **Prototype pollution:** `resolvePayloadSchema` and `resolveCheckAdapter` both use `hasOwnProperty.call` + `!== undefined` (no `in` / bare index). `config/validate.ts` `deepMerge` skips a `DANGEROUS_KEYS` set (`__proto__`/`constructor`/`prototype`) and iterates own enumerable keys only. `scrubSecrets` builds on a fresh plain object. No pollution path found.
- **Unbounded loops on attacker input:** `exceedsDepth` is bounded by maxDepth; `scrubSecrets` de-collision is O(1)-amortized per key (verified at scale). `config/validate.ts` `deepMerge` recurses unbounded on nesting, but its inputs are documented + sourced as TRUSTED boot config (not attacker-controlled), so this is acceptable for its contract — noted, not a finding.
- **Injection / SSRF / command:** zero `eval` / `new Function` / `child_process` / `exec` / `spawn` / `vm` / dynamic `require` in production source (only in prose comments + harness names). Zero provider-SDK imports. Zero SQLite. `packages/contracts` is pure, env-less, IO-free.
- **Information disclosure:** `resolveCheckAdapter` skip reason is a fixed constant (no untrusted-id reflection). `validateRunConfig` error names offending config paths only (no value leak). No new log/error path can carry a secret.
- **Fixtures:** all "secret"-shaped fixture strings are synthetic placeholders, not real keys.

## Disposition ledger
- Findings (critical/high): **0**
- Medium / low: **0**
- Notes (non-findings): `deepMerge` unbounded recursion on trusted-only input (documented contract; acceptable).
- All 7 prior per-slice CLEAN verdicts: still HOLD in the accumulated diff.

**Verdict: CLEAR.** No safety pin weakened. Phase 0 contracts may freeze from a security standpoint.
