---
description: Run a named eval class. Usage: /eval [category]
allowed-tools: Bash, Read
argument-hint: "[category|all]"
---

Run the named eval class.

Argument: `$ARGUMENTS` — one of the categories below; `all` runs the full suite. Default: prompt the user to pick if no argument.

<!-- ▼ EXAMPLE BLOCK [id=eval-body]: /eval body — illustrative shape. Replace wholesale with this project's eval classes. ▼ -->

The Doppl eval surface is the **held-out idea-quality rubric**: a 5-axis score (each `0–5`) applied by the **held-out judge** to compare generation N against generation N+1 on a held-out idea set. The five axes:

- **grounding** — claims are anchored in retrieved evidence (live web-search grounding), not fabricated.
- **novelty** — the idea is non-obvious relative to its parents / the zeitgeist baseline.
- **feasibility** — the idea is actionable and not internally contradictory.
- **falsification-survival** — the idea withstands the adversarial critic council's strongest objections.
- **subtype-check pass** — the subtype-specific objective checks (cross_domain_transfer vs zeitgeist_synthesis) pass.

The eval **reads persisted `run_events`** to reconstruct each generation's surviving candidates, then invokes the held-out judge (its fixed, immutable rubric + scoring policy) to score them. **No fresh model/embedding/web calls beyond the held-out judge** — everything else comes from the append-only log. It reports per-axis deltas and the total delta (gen N+1 minus gen N); the success bar is that later generations measurably beat earlier ones.

Argument values:
- `gen-delta` — score gen N vs gen N+1 on the 5-axis held-out rubric; report per-axis + total deltas.
- `rubric` — score a single generation's surviving candidates on the 5-axis rubric (no comparison).
- `subtype-checks` — run only the subtype-specific objective checks (cross_domain_transfer + zeitgeist_synthesis) over a generation.
- `all` — full eval suite (rubric on every generation + pairwise gen-deltas + subtype-checks).

## Mapping

| Argument | Command |
|---|---|
| `gen-delta` | `pnpm vitest run apps/api/test/eval/gen-delta.eval.ts` |
| `rubric` | `pnpm vitest run apps/api/test/eval/rubric.eval.ts` |
| `subtype-checks` | `pnpm vitest run apps/api/test/eval/subtype-checks.eval.ts` |
| `all` | `pnpm vitest run apps/api/test/eval/` |

## Pre-flight checks

1. **Required env var set** — the held-out judge's provider key (via the ModelGateway env) must be present; if not, abort with a clear message pointing at the setup doc. (No other provider key is needed — the eval reads persisted events for everything else.)
2. **Target reachable** — the Postgres `run_events` store must be reachable and the named run/generation must exist in the log; if down or absent, abort.
3. **Cost budget** — the held-out judge is the only paid call; if a cost cap is set, check current spend; abort if at cap.

## Output

Per category:
- Candidate count + held-out judge completion rate
- Per-axis scores (grounding · novelty · feasibility · falsification-survival · subtype-check pass) and, for `gen-delta`, per-axis + total deltas (gen N+1 − gen N)
- Cost: total + per-candidate average (held-out judge only)
- New findings / regression status (does gen N+1 still beat gen N on total?)

## Forbidden in this command

- **Running against any target other than the configured/allowlisted one.**
- **Auto-incrementing the cost cap.** If at cap, halt; surface to the user; the user decides.
- **Calling any model/embedding/web provider other than the held-out judge.** All non-judge inputs come from the persisted `run_events` log — no fresh generation, critic, or grounding calls on the eval path.

<!-- ▲ END EXAMPLE BLOCK [id=eval-body] ▲ -->
