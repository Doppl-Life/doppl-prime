---
description: Run tests by class. cwd-aware. Usage: /run-tests [unit|integration|all]
allowed-tools: Bash
argument-hint: "[unit|integration|all]"
---

Run tests by class. **cwd-aware** — runs the right test runner for whichever code area you're in.

Argument: `$ARGUMENTS` — see the mapping table(s) below. Default: `unit`.

## Step 0 — Detect mode

```bash
case "$(pwd)" in
  */web|*/web/*) MODE=the React dashboard ;;
  *)                                                      MODE=the backend (Doppl kernel + subsystems) ;;
esac
```

Announce the detected mode before running.

---

## the backend (Doppl kernel + subsystems) mode mapping

| Argument | Command |
|---|---|
| (empty / `unit`) | `pnpm test:unit` |
| `integration` | `pnpm test:integration` |
| `all` | `pnpm test` |
| <other class / marker> | `<command>` |

## the React dashboard mode mapping

| Argument | Command |
|---|---|
| (empty / `unit`) | `pnpm test:unit` |
| `integration` / `e2e` | `pnpm test:e2e` |
| `all` | `pnpm test` |

If an argument names a class that belongs to the *other* mode, **ERROR** with a clear message naming the expected cwd.

---

<!-- ▼ EXAMPLE BLOCK [id=test-class-discipline-notes]: test-class discipline notes — OPTIONAL. Some test classes
     need preconditions (a live external dependency, an env var, a slow browser).
     The source project documented things like: "the live-attack class needs a
     reachable target + a bearer env var, else it skips with a clear message;"
     "the visual-smoke class is slow — run per-PR, not per-commit." Add the
     project's own per-class discipline notes here, or delete this block. ▼ -->
Per-class discipline for Doppl:

- **`unit`** (`apps/api` and `apps/web`) — pure logic only: Zod contract round-trips, schema-snapshot tests on Appendix-A models, projection reducers, selection/scoring math, cap-clamp + redaction-scrub functions. No Postgres, no provider calls, no browser. Fast — run per-commit / per-slice.
- **`integration`** (`apps/api`) — runs against the **real Postgres event store** (append-only `run_events` writer + replay reader); asserts replay state-equivalence from the persisted log with **no model/embedding/web provider calls**. Needs a reachable Postgres (`DATABASE_URL`); if absent it must **skip with a clear message naming the missing env var**, never silently pass. Provider SDKs stay stubbed at the ModelGateway boundary — integration tests exercise the kernel/event-store seam, not live providers. Slower than unit; run before push and at phase-exit.
- **`e2e`** (`apps/web`) — Playwright dashboard smoke against a running API + seeded projections: lineage graph renders, run view loads, live→replay fallback works, status shown by shape+label+icon (not color alone). Slow + needs a live server — run **per-PR / per-phase, not per-commit**. Skips with a clear message if no base URL / server is reachable.
- **Safety-invariant slices** (caps, redaction, allowlist, injection-as-data, held-out-judge immutability, replay no-provider) ship as their **own** unit/integration tests — never bundled into feature-test files.
<!-- ▲ END EXAMPLE BLOCK [id=test-class-discipline-notes] ▲ -->

## Output

Report:
- Mode (which code area)
- Test count + class
- Pass / fail counts
- First ~20 lines of any failure
- Total duration
