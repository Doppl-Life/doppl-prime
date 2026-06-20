# /tdd Brief — Template

> The orchestrator session uses this template to author hand-offs to the implementer session. The implementer session reads the brief as context, then runs `/tdd <feature>` — the slash command's Step 0 (Restate) confirms the brief was parsed correctly; Steps 1–10 execute against the spec.

This doc is the canonical reference both sessions use:

- **Orchestrator** writes briefs in this format. The "Things to flag at Step 2.5" section is pre-loaded with design questions + default votes.
- **Implementer** reads the brief, runs `/tdd`, and at Step 9 surfaces categorized flags per the brief's "Lessons-logged candidates anticipated" section.

**TDD scope:** applies to deterministic code — code where a failing test can pin the behavior before the implementation exists. When a slice involves non-deterministic work (LLM-driven generation, pure visual changes), drop the `/tdd` brief in favor of the project's non-deterministic-coverage brief format (e.g. eval-fixture-first, or design-fixture-first).

Briefs scale down for trivial slices — drop sections that don't apply rather than truncating remaining ones.

---

## Where briefs live

Every `/tdd` brief is authored as a **file** in `docs/briefs/`, not just pasted ephemerally into the implementer session. Briefs are a permanent artifact — the design-decision audit trail for every slice the project has run.

**Naming:** `docs/briefs/NNN-<task-id>-<short-topic>.md` — e.g. `024-P3-2-payment-retry-logic.md`.

- **`NNN`** — a stable, zero-padded, sequential id on its own counter (parallel to `docs/sessions/`). Compute it the way session docs do: `ls docs/briefs/`, find the highest `NNN` prefix, increment. Numbers are stable IDs — never reused, never reordered. **Multi-track mode (the orchestrator carries a `<track>-` name prefix): prefix the filename with the track** — `docs/briefs/<track>-NNN-<task-id>-<topic>.md` — and compute `NNN` within the track (`ls docs/briefs/<track>-*`), so parallel tracks' briefs don't collide on merge (root `CLAUDE.md` "Naming + cross-bleed prevention").
- **`<task-id>`** — the `IMPLEMENTATION_PLAN.md` task this brief implements. Ties the brief to its phase.
- **`<short-topic>`** — kebab-case feature topic.

**Who writes + commits it:** the orchestrator authors the brief file; it rides the orchestrator's `/orchestrate-end` round terminal commit (`docs/briefs/` is orchestrator territory — the implementer never edits it). When a stale brief is refreshed for a re-run, **edit the existing file in place** rather than spawning a new number — the brief tracks the slice, not the attempt.

---

## Template format

```markdown
# /tdd brief — <feature_name>

## Feature
<one sentence: what's being built>

## Use case + traceability
- **Task ID:** <e.g. P3.2>
- **Architecture sections it implements:** <`ARCHITECTURE.md §X.Y`>
- **Related context:** <other docs / prior slices the implementer should know>

<!-- REQ IDs derive from the cited §s via the ARCHITECTURE.md Spec Anchor Index — add an explicit
     `Implements: REQ-x` line ONLY when overriding (one § maps to many REQs and this slice covers a
     strict subset). -->

## Acceptance criteria (what "done" means)
- [ ] <concrete behavior pin 1>
- [ ] <concrete behavior pin 2>
- [ ] All unit tests in `<path>` pass
- [ ] Integration test in `<path>` passes
- [ ] `/preflight` clean
- [ ] If applicable: cross-doc invariant updated atomic with the model change

## Wiring / entry point (Step 7.5)
<the production entry point this slice lands behind — route / job / CLI command / exported API — and
what calls the new code. If wiring genuinely belongs to a later slice, say exactly:
`none — wiring lands in <slice-id>`. `spec-lint brief` fails a brief without this section.>

## Files expected to touch
**New:**
- `<path>` — <what it does>

**Modified:**
- `<path>` — <what changes>

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests to write in `<test_path>`:

1. **`test_<name>`** — <one-sentence contract>
   - Asserts: <specific assertion>
   - Why: <pin to `ARCHITECTURE.md §X` or a LESSONS entry>

2. **`test_<name>`** — ...

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** <none / list of contract models touched>
- **Orchestrator doc rows to write hot (Step 9 routing):** <none / which `apps/api/CLAUDE.md` cross-doc rows + `ARCHITECTURE.md` Appendix A rows the orchestrator authors atomic with the round>
- **§2.5-seam (shared-contract) model touched?** If this slice's NEW/extended invariant touches an
  Appendix-A model whose `§` is crossed by a `§2.5` dependency edge, the RED outline MUST include the
  **schema-snapshot test** (model field-name set == checked-in snapshot, tagged `spec(§X)`) — the
  implementer authors it in this same `/tdd` cycle; Step 2.5 reviews it like any test.

> **Orchestrator territory** (canonical list: the `apps/api/CLAUDE.md` "must NOT touch" list — hook-enforced in team mode): flag at Step 9 categorized; the orchestrator writes hot during the same session and commits at `/orchestrate-end`.

## Things to flag at Step 2.5
Open design questions the implementer should surface before going GREEN. Pre-loaded with default votes — the implementer can take defaults or ping back with disagreement.

1. **<Question>.** <Two or three plausible answers.> My default vote: **<recommendation>**. <one-sentence rationale>.
2. **<Question>.** ...

## Dependencies + sequencing
- **Depends on:** <prior slices that must have landed>
- **Blocks:** <future slices that need this>

## Estimated commit count

**Prefer bundling when safe** — default to 2-4 related tasks per slice when bundling makes sense. A "slice" is one focused feature OR a small bundle of related features that share a commit. Bundling saves time + reduces Step-2.5 review overhead + commit verbosity without losing rigor.

**Bundle when ALL apply:**
- All features touch the same code area
- Total size is manageable (rough heuristic: < 100 lines added, < 30 min of TDD work)
- Features share context (similar setup, related concepts, overlapping test files)
- None of the features touch a safety invariant (per root `CLAUDE.md` "Key safety rules")
- Bisectability stays meaningful (the bundle is one logical unit)
- A reviewer can grok the whole thing in one sitting

**Do NOT bundle when ANY apply:**
- A safety-critical pin is in the slice (gets its OWN commit, always)
- Cross-area work
- Features have conflicting Step-2.5 design questions
- Each feature is large on its own (≥ 30 lines added each)
- Features have independent caller bases and might be cherry-picked separately
- A cross-doc invariant change is involved (atomic doc-edit pairing wants traceability)

Examples:
- ❌ DON'T: "add staleness check to oracle + add operator role to factory" (mixes safety invariants)
- ✅ DO: "add idempotency key + add retry helper + wire into payment handler" (3 related features, same module)>

## Lessons-logged candidates anticipated
Pre-bets the orchestrator is making about what Step 9 will surface.

- **Convention candidate** — <pattern likely to recur>
- **Future TODO — operational** — <perf/scaling consideration>
- **Architecture-doc note candidate** — <behavior consumers will depend on>

## How to invoke

> Do NOT prescribe `/session-start` here. Implementer sessions are reused across slices within a round — the session is already oriented. `/session-start` belongs only in the FIRST slice of a session, or after an explicit session swap. Jump straight to pre-flight checks + `/tdd <feature_name>`.

1. **Read this brief end-to-end.** Don't skip "Things to flag at Step 2.5" — design questions need answers before tests.
2. **Run `/tdd <feature_name>`** in the implementer session.
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 1 (Identify files)** — confirm the file list matches Files expected to touch.
5. **Step 2.5 (test review pause)** — ping back with answers to the design questions (or take defaults). Don't proceed to Step 4 until orchestrator + user sign off.
6. **Step 9 (summarize)** — surface anything that didn't fit the anticipated lessons-logged candidates.
```

---

## Worked example

<!-- ▼ EXAMPLE BLOCK [id=tdd-brief-worked-example]: worked example — illustrative format reference, NOT project content. Replace with a worked example from this project once the first real brief lands, OR keep this one labelled as illustrative. ▼ -->

```markdown
# /tdd brief — run_caps_reject_spawn_beyond_max_population

## Feature
Enforce `RunCaps.maxPopulation` in the runtime kernel: a reproduction/spawn
request that would push the live population past the cap is rejected and emits
a `spawn.rejected` event with `reason=max_population`. Caps live in the kernel,
never in agenome prompt text; `spawnBudget` is a hint clamped to
`min(remaining caps)`.

## Use case + traceability
- **Task ID:** P3.4
- **Architecture sections it implements:** `ARCHITECTURE.md §6.2` (RunCaps
  enforcement), §6.4 (spawnBudget clamping), §3.1 (run_events append-only writer)
- **Related context:** key safety rule #1 (caps are kernel invariants, not prompt
  text); the kernel track's prior P3.3 reproduction slice (parent selection landed).

## Acceptance criteria
- [ ] `enforceCaps(state, spawnRequest)` returns `{ allowed: true }` when
      `livePopulation + requested <= maxPopulation`
- [ ] Returns `{ allowed: false, reason: 'max_population' }` when the request
      would exceed `maxPopulation` — and the spawn does NOT occur
- [ ] A rejected spawn appends exactly one `spawn.rejected` event
      (status, reason=max_population) via the append-only writer — never an
      in-place edit
- [ ] `spawnBudget` from an agenome is clamped to `min(remaining caps)` BEFORE
      enforcement — an over-large budget hint cannot raise the effective cap
- [ ] No energy is debited on a rejected spawn (rejection is not a productive call)
- [ ] **Reachable from** the reproduction step in `apps/api/src/runtime/loop.ts` —
      invoked on the real evolution loop, not just from tests
- [ ] `/preflight` clean

## Wiring / entry point (Step 7.5)
Runtime kernel reproduction step (`apps/api/src/runtime/loop.ts:reproduce`).
Confirm `enforceCaps` is called there before any `spawn.created` append — not
just exercised from the unit test.

## Files expected to touch
**New:**
- `apps/api/src/runtime/caps.ts` — `enforceCaps` + `clampSpawnBudget`
- `apps/api/test/unit/runtime/caps.test.ts`

**Modified:**
- `apps/api/src/runtime/loop.ts` — call `enforceCaps` before spawning
- `apps/api/test/integration/runtime/reproduce.test.ts` — population-cap path

## RED test outline (apps/api/test/unit/runtime/caps.test.ts)
1. `enforce_caps_allows_under_max` — Asserts: `allowed: true` when under cap. Why: §6.2 happy path.
2. `enforce_caps_rejects_at_max` — Asserts: `allowed: false`, `reason: 'max_population'`, no spawn. Why: §6.2 cap boundary.
3. `enforce_caps_emits_spawn_rejected_event` — Asserts: exactly one `spawn.rejected` appended via the writer, no in-place edit. Why: §3.1 append-only truth + safety rule #2.
4. `clamp_spawn_budget_to_remaining_caps` — Asserts: over-large `spawnBudget` clamped to `min(remaining caps)`. Why: §6.4 + safety rule #1 (budget is a hint, not an override).
5. `rejected_spawn_debits_no_energy` — Asserts: energy unchanged after rejection. Why: safety rule #8 (energy = success-only spend).

## Cross-doc invariant impact
- **Model field changes:** none (uses existing `RunCaps`, `SpawnRequest` Appendix-A models).
- **Orchestrator doc rows to write hot:** confirm the `#caps-kernel-enforced` cross-doc row in `apps/api/CLAUDE.md` pins this test path; add a `spawn.rejected` event row to `ARCHITECTURE.md` Appendix A if not already present.
- **§2.5-seam model touched?** `RunCaps` is a frozen `packages/contracts` model crossed by a §2.5 edge — include the schema-snapshot test (field-name set == snapshot, tagged `spec(§6.2)`).

## Things to flag at Step 2.5
1. **Rejection signal — event-only, or also a thrown error?** Default: append `spawn.rejected` and return a result object; do NOT throw (rejection is expected control flow, not an exception). Default vote: **event + result object** — keeps the loop branchable and the log authoritative.
2. **Clamp BEFORE or AFTER population check?** Default: clamp `spawnBudget` first, then enforce against the clamped value. Default vote: **clamp first** — a prompt-supplied budget must never be the thing that decides the cap (safety rule #1).

## Dependencies + sequencing
- **Depends on:** P3.3 reproduction parent-selection (landed); P0 frozen `RunCaps` contract.
- **Blocks:** P3.5 generation-cap + wall-clock-cap enforcement (reuses `enforceCaps` shape).

## Estimated commit count
**1.** Safety-critical pin (a kernel cap invariant) — gets its OWN commit, never bundled.

## Lessons-logged candidates anticipated
- **Convention candidate** — "Caps reject via an appended event + result object, never a throw; rejection is control flow."
- **Architecture-doc note candidate** — clarify §6.2 that `spawnBudget` is always clamped before enforcement, so an agenome can never raise its own effective cap.
```

<!-- ▲ END EXAMPLE BLOCK [id=tdd-brief-worked-example] ▲ -->

---

## Why this format works

- **The brief lives outside the slash command's prompt loop.** It's context the implementer reads before invoking `/tdd`. Step 0 becomes the *check* that the brief was parsed correctly, not the *source* of the spec.
- **Step 2.5 design questions are pre-loaded.** Without them, the implementer either makes unilateral decisions or pauses Step 2.5 to ask. Pre-loading 3-4 plausible questions with default votes lets the implementer take defaults (fast path) or ping back with real disagreement (slower but correct).
- **Cross-references inline.** The implementer can look up underlying findings without navigating whole docs.
- **Acceptance criteria are concrete behaviors, not abstractions.** "Confidence <0.7 escalates" is testable; "the judge is reliable" is not.
- **Cross-doc invariant impact named explicitly even when "none."** Forces the orchestrator to actually check.

The format scales down for trivial slices by dropping sections that don't apply — not by truncating remaining ones.

---

## Common pitfalls (orchestrator self-check before handing the brief over)

### Pitfall — Bundling / atomizing wrong (criteria in "Estimated commit count")

- **Safety-critical pin bundled with other work** — every safety-critical slice gets its OWN commit; flag it in "Estimated commit count" when an acceptance criterion is a safety pin.
- **Over-atomizing** — three 10-line helpers as three briefs / reviews / commits when they're one logical unit. Default posture: **bundle when safe, atomize only when required**; a bundled brief lists each feature's RED tests and ends in one Step-10 commit.

### Pitfall — Skipping Step 2.5 design questions because the brief "felt small"

Symptom: a brief omits "Things to flag at Step 2.5" because the slice is "obvious." The implementer then makes ≥3 design decisions silently during GREEN — the orchestrator finds out at Step 9 with no review opportunity.

**Rule** — every brief has at least one pre-loaded Step 2.5 question even when the slice feels trivial. If you can't find a real design question, the slice is probably implementing something already-decided and doesn't need a brief at all.

### Pitfall — Acceptance criteria phrased as abstractions instead of behaviors

Symptom: "the parser is robust" / "storage is performant" / "the API is well-designed." Not testable.

**Rule** — every acceptance criterion is a concrete behavior pin: "filter-by-category returns the subset," "round-trip preserves equality." If you can't write a test for it, it's not an acceptance criterion.

### Pitfall — Prescribing `/session-start` in "How to invoke"

The implementer reuses its session across a round's slices — it's already oriented. "How to invoke" jumps straight to `/tdd <feature_name>`; include `/session-start` only for the first slice of a session or after a swap. (Stated in the template's "How to invoke.")

<!-- ▼ EXAMPLE BLOCK [id=project-specific-pitfalls]: project-specific pitfalls — the source project accreted several more pitfalls unique to its domain (contract-type placement, model-ID verification against live catalogs, matrix-driven brief file-list reconciliation, agent-existence ≠ pipeline-readiness). Add the project's own recurring brief-authoring mistakes here as they emerge — each one is cheap insurance against a repeat. ▼ -->

### Pitfall — Bundling a safety-invariant slice with feature work

Symptom: a brief folds a cap/redaction/allowlist/injection/held-out-judge pin into a larger feature slice "since it's only a few lines." Doppl's safety rails (caps in the kernel, the persistence-boundary redaction scrub, the check-runner allowlist, the sentinel-delimited untrusted-input handling, the immutable held-out judge) are the load-bearing organism floor.

**Rule** — every safety-invariant slice (key safety rules #1–#9) gets its OWN brief and its OWN commit, never bundled. If an acceptance criterion pins one of those invariants, "Estimated commit count" says so and isolates it.

### Pitfall — Mocking the event store on the load-bearing path

Symptom: a brief's RED outline stubs the Postgres `run_events` writer / reader instead of running against the real append-only store. Mocking hides sequence-ordering, redaction-at-boundary, and validation bugs — exactly the things the event log exists to guarantee.

**Rule** — kernel/event-store slices test against the **real Postgres event store** (no mocks on the load-bearing path, per the project's TDD scope). Reserve doubles for provider SDKs behind the `ModelGateway`, never for the truth log.

### Pitfall — Forgetting replay-determinism on a slice that touches state

Symptom: a brief adds or changes an event-producing behavior but its acceptance criteria never assert that replay from the persisted log + per-run RNG seed reconstructs an equivalent state **without** calling any model/embedding/web provider.

**Rule** — any slice that appends or shapes events carries a replay-equivalence acceptance bullet (state-equivalent from the log; zero provider calls on the replay path — key safety rules #7). Replay-determinism slices are authored standalone, never bundled with feature work.

### Pitfall — Asserting energy debit on a failed/retried call

Symptom: a brief's test debits energy on every provider attempt, or forgets to assert a `provider_call_failed` event on a failed/retried/repaired attempt. Energy is **success-only spend** (key safety rule #8) — debiting on failure breaks the finiteness guarantee and the fitness economy.

**Rule** — every energy-touching brief pins: energy debited **only** on a successful productive call; failed/retried/repaired attempts emit `provider_call_failed` and debit nothing. Make it an explicit acceptance bullet, not an implementation detail.

<!-- ▲ END EXAMPLE BLOCK [id=project-specific-pitfalls] ▲ -->

---

## When NOT to use a /tdd brief

The brief is for **TDD slices** (deterministic code). Skip (or use a simpler hand-off) for:

- **Pure documentation work** (`IMPLEMENTATION_PLAN.md` edits, `ARCHITECTURE.md` prose, session docs). Just edit directly.
- **Infrastructure / deploy work.** Use `docs/runbooks/` instead.
- **Exploratory spikes** to learn an API. Mark as exploratory; throw away; then TDD the real implementation.
- **Non-deterministic behavior** (LLM-driven generation, pure visual changes). Use the project's non-deterministic-coverage brief format instead.

Outside these cases, brief in this format. Every time.
