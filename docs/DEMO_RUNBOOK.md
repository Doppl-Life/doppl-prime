# Doppl — Demo Runbook

> *It's not the agent — it's the kernel that breeds the agents; the event log is the truth, and the held-out judge is the floor the organism cannot lift.*

Step-by-step guide to boot and run the Doppl demo, **both** the creds-free replay path (the demo-of-record — always works, no API keys) **and** the live path (the headline — real LLMs evolving against your problem). Local-first; identical boot sequence either way (`ARCHITECTURE.md §17`).

**The headline:** type a problem → a bounded population of agent genomes generates candidate ideas → an adversarial critic council + a held-out judge + objective checks score them → weak lineages are culled, strong ones fuse + mutate → a later generation beats an earlier one → the dashboard shows the **final surviving idea** with its full evidence (lineage, critics, checks, score, energy).

---

## 1. Prerequisites

- **Node 22 LTS** + **pnpm** (workspace monorepo).
- **PostgreSQL** reachable via `DATABASE_URL` (the authoritative `run_events` log + projections). No committed compose file — a one-liner for a throwaway local DB:
  ```bash
  docker run --rm -d --name doppl-pg -p 5432:5432 -e POSTGRES_PASSWORD=doppl postgres:16
  # → DATABASE_URL=postgres://postgres:doppl@localhost:5432/postgres
  ```
- For the **live path only**: an **OpenRouter** API key (and optionally an **OpenAI** key for embeddings/novelty). The replay path needs **no real keys**.

Migrations run automatically at boot (`bootApp`: migrate → seed → start) — no separate migrate step. SQLite is not supported; Postgres only.

---

## 2. One-time setup

```bash
pnpm install                       # from the repo root
cp .env.example .env               # fill in real values, then EXPORT them (see note)
```

> **No dotenv auto-load.** The boot reads `process.env` directly — copying `.env.example` to `.env` does **not** load it automatically. Export the vars into your shell before booting: `set -a; . ./.env; set +a` (POSIX), or inline-prefix each command (`DATABASE_URL=… OPENROUTER_API_KEY=… pnpm -C apps/api start`).

`.env.example` lists **every** env var the boot reads, each marked REQUIRED/OPTIONAL with a placeholder (it is single-sourced from the code allowlist and drift-guard-tested — it can't fall out of sync with what the boot actually reads, and it contains no real secrets).

---

## 3. Environment

Required at boot **always** (the boot fails fast, naming any missing var — never echoing a value, KEY SAFETY RULE #4):

| Var | Replay path | Live path |
|---|---|---|
| `DATABASE_URL` | real Postgres URL | real Postgres URL |
| `OPENROUTER_API_KEY` | **placeholder** (e.g. `sk-REPLACE_ME`) — never used by replay | **real** OpenRouter key |
| `OPENAI_API_KEY` | **placeholder** — never used by replay | **real** (embeddings/novelty; without it novelty degrades but the run still completes) |

> The replay path requires the provider-key vars to be *present* (boot fail-fast stays intact) but **never uses their values** — placeholders are correct and safe. Replay calls **no** providers (KEY SAFETY RULE #7).

Optional knobs (defaults shown):

| Var | Default | Purpose |
|---|---|---|
| `DOPPL_GATEWAY` | `recorded` | `recorded` (replay) or `live` (real LLMs) |
| `DOPPL_SEED_FIXTURE` | _(unset)_ | runId to seed before serving (e.g. `demo-recorded-001`); unset → no-seed live boot |
| `DOPPL_FIXTURE_DIR` | repo `fixtures/replay/` | where seed reads the fixture |
| `DOPPL_MAX_POPULATION` / `DOPPL_MAX_GENERATIONS` / `DOPPL_ENERGY_BUDGET` | config defaults | kernel caps (only lower within validated maxima) |
| `DOPPL_RNG_SEED` | config default | deterministic RNG seed |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | API listen address |
| _(Langfuse)_ | _(deferred)_ | LLM observability (Langfuse) is **P2.8-deferred — not yet wired**, so there is no Langfuse env to set; boot needs none (a local trace-metadata fallback is retained). Env vars are added when it's wired. |

Provider keys are **env-only** — never written to events, projections, Langfuse traces, or UI payloads (a redaction scrub runs at every persistence boundary, RULE #4).

**Sourcing the env (no dotenv auto-load).** `loadConfig` reads `process.env` **directly** — there is no `.env` auto-load. Export the vars in the shell that runs the API. If you keep a gitignored `.env` at the **repo root** (not `apps/api/`), source it into that shell first:
```bash
set -a; . ./.env; set +a            # then run the API / smoke in the SAME shell
# live smoke, for example:  set -a; . ./.env; set +a; DOPPL_GATEWAY=live pnpm -C apps/api test:smoke:live
```

**Web dashboard ↔ API (local dev — PD.14/15/16).** `pnpm -C apps/web dev` serves the dashboard on Vite and reaches the API through a **dev proxy** (`/api` → `http://localhost:3000`, prefix stripped, SSE-safe) — so **start the API on `:3000` first**. The API serves at root (no `/api` prefix); the proxy adds/strips it. Override the base with `VITE_API_BASE` (and `VITE_API_PROXY_TARGET` for the proxy upstream) to point at a non-default origin. The dashboard's read/live-SSE/operator-Start/Stop paths are all reconciled against the real API (PD.15/PD.16) — opening the dashboard against a running API just works.

---

## 4. Path A — Creds-free replay (the demo-of-record)

The safe default. Boots the real stack and replays a committed real run — no API keys, fully deterministic, identical choreography to a live run.

```bash
# env (exported in your shell — no dotenv auto-load): DATABASE_URL=real,
#   OPENROUTER_API_KEY=placeholder, OPENAI_API_KEY=placeholder,
#   DOPPL_GATEWAY=recorded, DOPPL_SEED_FIXTURE=demo-recorded-001
pnpm -C apps/api start        # migrate → seed(demo-recorded-001) → serve on :3000
pnpm -C apps/web dev          # the dashboard (Vite) in a second terminal
```

Open the dashboard → the seeded run is loaded → step through lineage, the fitness/generation charts, critic gauntlet, subtype-check evidence, energy, and the **final surviving idea** proof panel (its evidence deep-links all resolve). This is the fallback you show if the network/providers are unavailable.

**Validate it before you present:**
```bash
pnpm -C apps/api test:smoke:demo   # creds-free e2e: boot→seed→replay reaches terminal +
                                   # the final-idea 'selected' winner resolves + replay calls no provider
```

---

## 5. Path B — Live (the headline)

Real LLMs evolve against a problem you type. Non-deterministic, costs money, needs keys. Keep caps **low** to fit the ~10-minute demo window.

```bash
# env (exported in your shell — no dotenv auto-load): DATABASE_URL=real,
#   OPENROUTER_API_KEY=real, OPENAI_API_KEY=real, DOPPL_GATEWAY=live,
#   DOPPL_MAX_POPULATION=3, DOPPL_MAX_GENERATIONS=2   (leave DOPPL_SEED_FIXTURE unset)
pnpm -C apps/api start
pnpm -C apps/web dev
```

In the dashboard: pick a prepared problem **or** type your own → start the run → watch generation improvement, lineage specialization, and critic/check evidence stream live (SSE) → the final surviving idea appears when the run completes.

**Validate the live path before you present** (asserts the safety/correctness invariants on a real run — reaches terminal · caps enforced · a winner resolves · energy debited on success only · no key leaks into events; then captures the run + replays it to confirm replay-determinism):
```bash
OPENROUTER_API_KEY=… OPENAI_API_KEY=… DATABASE_URL=… \
  pnpm -C apps/api test:smoke:live
```
The suite **skips cleanly without `OPENROUTER_API_KEY`** (so `/preflight` and CI stay green keyless); it runs as the headline smoke when keys are present.

> **Caps tuning:** if a live run doesn't reach a final winner with `pop 3 / gen 2`, raise `DOPPL_MAX_POPULATION` / `DOPPL_MAX_GENERATIONS` (within the validated maxima) until it reliably produces a scored survivor. The demo override only ever **lowers** caps within validated maxima — it never bypasses cap-max validation (RULE #1).

---

## 6. The fallback ladder (live demos, operator-driven — `ARCHITECTURE.md §17`)

If a live run stalls or a provider fails, fall back **manually** (you control stage timing — there is no auto-fallback):

1. **Rung 1 — low-cap live run** (the headline attempt).
2. **Rung 2 — a prepared known-good run** (switch on stall/failure).
3. **Rung 3 — a clearly-labeled replay** of a recorded run (Path A — always works).

Switching performs zero authoritative writes and mutates no prior run. The dashboard's mode banner labels live vs replay (colorblind-safe), and `GET /runs/:id/health` surfaces the continue-vs-switch signal (generation, operations in flight, last-event time, caps consumed).

---

## 7. §16 rehearsal coverage map

The §16 demo rehearsals are covered by automated tests + the operator procedures above:

| §16 rehearsal | Coverage |
|---|---|
| Prepared/replay run | `test:smoke:demo` (automated, keyless) + Path A |
| Config-validation boot smoke | `test:smoke:demo` config-boot tests (automated) |
| Low-cap live run | `test:smoke:live` (automated, opt-in with keys) + Path B |
| Replay state-equivalence (RULE #7) | `test:smoke:demo` + `test:smoke:live` (capture→replay) + the replay-summary/replay-reader unit tests |
| Fallback ladder (all 3 rungs) | the PD.4 fallback-ladder + cap-override unit tests + §6 above (operator procedure) |
| Provider-failure → replay | the fallback ladder (operator switch to Rung 3) + the replay-equivalence tests |
| Final-idea evidence walkthrough | the P7.15 dashboard Playwright smoke (deep-links resolve) + §4/§5 above |

---

## 8. Re-recording the committed fixture

The committed demo-of-record fixture is `fixtures/replay/demo-recorded-001.json` (creds-free, deterministic). **Re-record it on a `schemaVersion` bump** (fixtures are re-recorded, never upcast — `ARCHITECTURE.md §17`):
```bash
pnpm -C apps/api capture:demo-fixture     # drives a fresh run + dumps the fixture
```
If you want the committed demo-of-record to be a *live* run instead, run the capture with real keys (`DOPPL_GATEWAY=live`) — note that a live capture is non-deterministic and costs money, so the creds-free recorded fixture remains the stable default.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Boot aborts naming a var | a REQUIRED env var is missing — set it in `.env` (RULE #4 fail-fast; the error names the var, never the value). |
| Boot aborts on the fixture | `DOPPL_SEED_FIXTURE` set but the fixture is missing/invalid/newer `schemaVersion` — re-record (`capture:demo-fixture`) or unset it for a live boot. |
| Live run never produces a winner | caps too low — raise `DOPPL_MAX_POPULATION`/`DOPPL_MAX_GENERATIONS` (within maxima). |
| Novelty shows degraded | `OPENAI_API_KEY` absent/invalid — embeddings unavailable; the run still completes (`novelty_scoring_degraded`). |
| Langfuse setup? | Not wired yet (P2.8-deferred) — no Langfuse env or setup is needed for the demo. |
| A provider/network fails mid-live-demo | use the fallback ladder (§6) — switch to a prepared run, then to replay (Path A). |

---

## 10. Safety invariants (preserved in every path)

Caps are kernel-enforced (never prompt-enforced); the event log is append-only + authoritative; no arbitrary code execution (allowlisted non-executing checks); secrets never leave the server (redaction at every persistence boundary); model output is untrusted until schema-validated; the held-out judge + rubric are immutable to agents; replay calls no providers; energy = successful productive spend only. These hold whether you run replay or live.
