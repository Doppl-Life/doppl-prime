# PRD 10: Live Run Operator Console Prototype

## Prototype Question

Can one operator start, monitor, stop, and recover a Doppl run during a live demo without needing to understand every internal subsystem?

## Audience Moment

Within 10 seconds, a viewer should see whether the run is healthy, what generation is active, how much budget remains, and whether the operator should continue, stop, or switch to fallback.

## User Workflow

- Choose case, run caps, model profile, scoring policy, and initial agenome pool.
- Start a run.
- Watch current generation, candidates in flight, last event time, caps consumed, and provider health.
- Stop a run idempotently.
- Switch to prepared run or replay if health degrades.

## Required Data / Events

- `RunConfig`, `RunCaps`
- `run.configured`, `run.started`, `run.stopped`, terminal events
- REST create/stop/health endpoints
- SSE stream status
- provider failure and schema rejection events
- fallback ladder state

## Acceptable Fixture

Use a fake runtime or seeded replay fixture for the first console prototype. It must still use the same command/query shapes planned for production.

## Convincing Demo Bar

- Starting a run feels controlled and bounded.
- Health is legible without opening logs.
- Stop is visibly safe and idempotent.
- Fallback is an operator choice, not a hidden automatic switch.
- Invalid caps fail closed before the run starts.

## Falsification Bar

This prototype fails if the operator needs terminal access, if live/replay state is ambiguous, or if the console can mutate authoritative state outside approved commands.

## Graduation Path

Connect to real REST/SSE APIs and `GET /runs/:id/health`. This console becomes the capstone operator surface and later the production run-control surface.

