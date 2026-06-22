# /tdd brief — sse_run_event_stream

## Feature
`GET /runs/:id/stream` — a **delivery-only, non-authoritative SSE** run-event stream on the P6.6 Fastify server: emits run events in **sequence order** with the SSE `id` = the event `sequence` (so a reconnect resumes via `Last-Event-ID` with no gap/no duplicate before the cursor); carries **operation-start/in-flight markers AND completions** (so the dashboard renders the live in-flight window, §4/§12); never writes or mutates the event log (dropping the stream loses no authoritative state). A demo-owned **event-bridge** feeds the stream from the event store by polling `readByRun` past the cursor (no kernel-side append hook — track-isolated). If streaming is unavailable the client falls back to polling `GET /events`/replay (already built: P6.7 + the P7.2 resync) and reconstructs the identical ordered view.

## Use case + traceability
- **Task ID:** P6.9 (SSE run-event stream — delivery-only, resume from lastEventId, polling fallback)
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (SSE delivery-only; SSE id = sequence; resume from `Last-Event-ID`; polling fallback), `§4`/`§12` (the stream carries operation-start markers + completions for the live in-flight window; sequence is the sole ordering key — disconnect/resync yields the identical projection).
- **Related context:** key safety rule #2 (SSE non-authoritative — never writes the log; the client resyncs from `sequence`, never treats the stream as truth). **Builds on P6.7** (read surface) + the P6.6 Fastify server + the event-store `readByRun` (read-imported, like P6.7's listRunIds — **no kernel-file edit**). The client-side fallback (resync/polling) already shipped in P7.2. Integration via testcontainers + Fastify `inject`.

## Acceptance criteria (what "done" means)
- [ ] `GET /runs/:id/stream` emits run events over SSE in **sequence order**; each SSE message's `id` is the event `sequence`
- [ ] On connect with a **`Last-Event-ID`** (or `?lastEventId=`) the stream resumes strictly from that cursor — events with `sequence` > cursor only, **no gap and no duplicate before the cursor**
- [ ] The stream carries **operation-start/in-flight markers AND completion events** (not only completions) — the full ordered run-event stream (§4/§12 live in-flight window)
- [ ] **Delivery-only / non-authoritative:** the stream never writes to or mutates the event log; dropping + reconnecting (resuming from the cursor) reconstructs a view **identical** to the uninterrupted stream (sequence sole ordering key)
- [ ] A demo-owned **event-bridge** feeds new events to the stream by reading `readByRun` past the cursor (read-imported event store — **no kernel-file edit**); the poll interval is **injectable** (no real timers in unit tests)
- [ ] Unknown runId → clean 404/stream-close; the client's polling fallback (P6.7 `GET /events` + P7.2 resync) reconstructs the same ordered view (assert the equivalence)
- [ ] Integration tests (testcontainers + Fastify `inject`) pass; **both counts reported**; `/preflight` clean

## Wiring / entry point (Step 7.5)
**Entry point — the P6.6 Fastify server** (`GET /runs/:id/stream` registers on `buildServer`). First consumer: the dashboard's `sseStream` (P7.1, wired at integration) → the P7.2 run-store. So: *registered on the P6.6 server; consumed by the P7.1 sseStream + P7.2 store at integration.*

## Files expected to touch
**New:**
- `apps/api/src/sse/event-bridge.ts` — the demo-owned bridge: reads `readByRun` past a cursor + yields new events in sequence order (injectable poll interval; delivery-only)
- `apps/api/src/routes/run-stream.ts` — `GET /runs/:id/stream` (SSE framing: id=sequence; resume from Last-Event-ID)
- `apps/api/test/integration/routes/run-stream.test.ts` (+ unit for the bridge cursor logic)

**Modified:** `apps/api/src/server.ts` (register the route).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**(testcontainers + Fastify `inject`; unit for the bridge; `spec(§11)`/`spec(§4)`):**
1. **`test_stream_emits_events_in_sequence_order_with_id`** — appended events stream over SSE in sequence order; each SSE `id` = the event sequence. *(Positive guard.)* Why: §11.
2. **`test_resume_from_last_event_id_no_gap_no_dup`** — connecting with `Last-Event-ID=N` delivers only sequence>N, no gap/dup before the cursor. Why: §11 resume.
3. **`test_stream_carries_markers_and_completions`** — operation-start markers + completions both appear in the stream (full ordered run-event set). Why: §4/§12 in-flight window.
4. **`test_stream_delivery_only_non_authoritative`** — the stream appends no event + mutates no projection; the event count is unchanged after streaming. Why: rule #2.
5. **`test_resync_equivalent_to_uninterrupted`** — a drop+resume-from-cursor delivers the same ordered set as an uninterrupted stream (sequence sole ordering). Why: §11 disconnect/resync equivalence.
6. **`test_bridge_reads_past_cursor_injectable_interval`** — (unit) the bridge yields events with sequence>cursor via readByRun; the poll interval is injected (no real timer). Why: bridge logic.
7. **`test_unknown_run_clean_close`** — unknown runId → clean 404/close (not a partial/hung stream). Why: §11.

## Cross-doc invariant impact
- **Model field changes:** none. **§2.5-seam:** none (read-imports the event-store schema/reader like P6.7 — no kernel-file edit).
- **Orchestrator doc rows (Step 9):** a likely LESSONS entry (the delivery-only SSE bridge — poll readByRun past the cursor, id=sequence resume, non-authoritative, demo-owned no-kernel-edit). I author hot.

## Things to flag at Step 2.5
1. **Bridge mechanism — poll vs append-notify.** My default vote: **poll `readByRun` past the cursor** (demo-owned, read-imported event store, no kernel append-hook edit — track-isolated, like P6.7's listRunIds); injectable interval (no real timers in tests). An in-process append→notify bus is an integration optimization (later, when the kernel wires it). Confirm polling for MVP.
2. **Cursor source.** My default vote: `Last-Event-ID` header (SSE-standard reconnect) with a `?lastEventId=` query fallback; numeric-guarded (reuse the P6.7 cursor guard). Confirm.
3. **SSE framing/test approach.** My default vote: standard SSE (`text/event-stream`, `id:`/`data:` frames); test via Fastify `inject` reading the streamed body (bounded — close after the appended set) + the bridge unit tests with an injected interval (deterministic, no hanging stream). Confirm the test bound (close-after-N).

## Dependencies + sequencing
- **Depends on:** **P6.7** (read surface — `5b9590b`), **P6.6** (Fastify server — `034d587`), event-store `readByRun`. The client fallback (P7.2 resync) already shipped. No live P3 needed (fixtures via the real writer).
- **Blocks:** the P7 dashboard live view (P7.1 sseStream consumes this at integration); PD live demo.

## Estimated commit count
**1.** Feature slice (SSE endpoint + bridge). Not safety-invariant (delivery-only read; rule-#2 non-authoritative pinned by RED #4). Step-8: code-quality phase-boundary; security-reviewer optional (read-only delivery; ids parameterized).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the SSE run-event stream is delivery-only + non-authoritative: a demo-owned event-bridge polls `readByRun` past the cursor (read-imported event store — no kernel-file edit, like P6.7 listRunIds), SSE id=sequence so Last-Event-ID resume is gap/dup-free, carries markers+completions for the live window; drop+resync == uninterrupted (sequence sole ordering); never writes the log (rule #2); injectable interval keeps tests timer-free."

## How to invoke
> obs (apps/api) session oriented — `/tdd`. cwd `apps/api/`. Stage only `apps/api/...`. (Queued after P6.8 — continuous roll.)
1. **Run `/tdd sse_run_event_stream`.**
2. **Step 2.5** — answer the 3 questions (esp. Q1 poll-not-append-notify, Q3 test bound), send the write-up + coverage map.
3. **Step 9** — surface the LESSONS candidate.
