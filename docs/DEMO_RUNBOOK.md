# Doppl Demo Runbook

The §16 operator-facing companion to the rehearsal int tests under
`apps/api/__integration_tests__/rehearsals/`. Each section names the
manual operator equivalent of one CI-gated rehearsal.

---

## 0. Pre-flight

Run these once before the showcase. The team re-records fixtures after every
Phase 0 contract change; check that the latest fixture under `fixtures/replay/`
is newer than the last contracts commit.

```bash
docker compose up -d postgres
pnpm install
pnpm -w typecheck && pnpm -w lint && pnpm -w test
pnpm -w test:int       # all integration tests, including the 6 rehearsals
```

---

## 1. Boot the demo locally

Three commands. Open three terminals.

```bash
# Terminal 1 — Postgres (already running from pre-flight)
docker compose ps postgres

# Terminal 2 — API + worker (boot-demo.ts; PD.3)
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/postgres \
  pnpm --filter @doppl/api boot:demo

# Terminal 3 — dashboard
pnpm --filter @doppl/web dev
# Open the URL it prints (http://localhost:5173 by default).
```

To seed a recorded run at boot, set `DOPPL_DEMO_FIXTURE` to a JSON file
under `fixtures/replay/`. Boot loads it strictly after migrations.

---

## 2. Run a prepared problem (rung 2 — known-good live)

1. Open the dashboard. The "Demo controls" panel is on the left rail above
   "Run configuration".
2. Leave the radio on **Prepared**.
3. Pick a problem from the dropdown (the two curated entries live at
   `fixtures/curated-prompts/`).
4. Optionally narrow caps via the **maxPopulation** / **maxGenerations**
   overrides — values above the dashboard's MAX_CAPS clamp; the warning surfaces
   under the form.
5. Click **Start**. The fitness chart and lineage graph populate as
   generations advance.

What to watch on the panels during the demo:
- **Lineage graph**: agenome → candidate fan-out. Newly spawned nodes flash in
  on each SSE frame.
- **Fitness over time**: the moving line on the main chart shows the
  population's mean fitness climbing across generations.
- **Generation comparison**: best vs median per generation — quick visual proof
  that the loop selects, not just samples.
- **Final-surviving idea**: resolves once the run terminates; the 6 evidence
  deep-links all point at events queryable on the same projection.
- **ModeIndicator (top of shell)**: the audience-visible badge. LIVE for rung
  1/2, REPLAY for rung 3.

---

## 3. Type a custom prompt (operator path — rung 1 live + custom seed)

1. Same Demo controls panel. Click the **Custom prompt** radio.
2. Paste the prompt in the textarea. Whitespace-only inputs disable the Start
   button; the server's `EmptyPromptError` is the structural safety net.
3. Same cap-override controls. Click Start.

Notes:
- The prompt content is treated as DATA. The Phase 4 candidate-as-DATA
  isolation seam means a prompt-injected critic-move cannot land — the
  helper does not sanitize.
- `seed` for the run is derived deterministically from the prompt (verbatim
  under 64 chars, SHA-256-prefixed beyond). Identical prompts → identical runs.

---

## 4. Three-rung fallback in front of a room

The §16 ladder is operator-driven — never auto-switching. Use this script
when something hiccups mid-demo. Each rung activation starts a NEW run; the
previous run stays terminal and inspectable from the dashboard's run list.

| Symptom (during demo) | Operator action | Resulting badge |
|---|---|---|
| Live provider returns 5xx or a long-running call | Lower caps via Demo controls + Start again | LIVE (rung 1) |
| Live provider continues to flake or rate-limit | Pick a curated problem + Start (no overrides) | LIVE (rung 2) |
| Boot the safety net | `POST /demo/runs/replay/<fixtureId>` (or wire a button) | REPLAY (rung 3) |

Operator narration:
- Rung 1: "Let me narrow the population so the loop converges faster…"
- Rung 2: "Switching to a curated problem I know shipping cleanly…"
- Rung 3: "And here's a recording from a clean run we captured during
  rehearsal — same trajectory, just labeled REPLAY."

The dashboard's **ModeIndicator** carries the REPLAY badge during rung 3 so
the audience sees the switch.

---

## 5. What to do if the projector flakes

The dashboard's SSE stream resumes via Last-Event-ID — a browser refresh is
non-destructive. Steps:

1. Refresh the browser window.
2. The dashboard reattaches to the active run by URL; the SSE stream resumes
   from the last sequence the local reducer applied. No events are replayed
   twice (the reducer is idempotent on sequence).
3. If the API process itself died, restart `boot:demo` from Terminal 2 — the
   replay-served run survives because it's in the DB.

The **HealthPanel** surfaces a "consider switching to a prepared run or
replay rung" hint when `lastHeartbeatMs > 10s` on a `running` live run. That's
your visual cue to advance the ladder before the audience notices.

---

## 6. Stop everything

```bash
# Terminal 2: Ctrl-C — boot:demo handles SIGINT (graceful shutdown,
#                     stops worker, closes server, drains pool).
# Terminal 3: Ctrl-C — Vite dev server.
# Terminal 1: optional — docker compose down (preserves DB unless -v).
```

---

## Reference — files this runbook talks about

- `apps/api/scripts/boot-demo.ts` — the unified boot script (PD.3 / U7)
- `apps/api/src/event-store/scripts/dump-replay.ts` — capture a finished run
- `apps/api/src/event-store/scripts/seed-demo.ts` — load a captured run
- `apps/api/src/runtime/demo/fallback-ladder.ts` — three-rung server controller
- `apps/api/src/runtime/demo/demo-cap-override.ts` — cap clamp (only lowers)
- `apps/api/src/runtime/demo/demo-run-config.ts` — operator + prepared config helper
- `apps/api/src/http/routes/demo.ts` — `/demo/*` HTTP endpoints
- `apps/web/src/demo/OperatorPromptPanel.tsx` — left-rail demo controls
- `fixtures/replay/` — committed seed fixtures
- `fixtures/curated-prompts/` — the curated problem set
- `apps/api/__integration_tests__/rehearsals/` — the 6 CI-gated rehearsal tests
