# PRD 14: Demo Fallback Ladder Prototype

## Prototype Question

Can Doppl survive live-demo uncertainty by moving through a manual, honest fallback ladder without violating event truth or confusing the audience?

## Audience Moment

Within 10 seconds, a viewer should know whether the current view is low-cap live, prepared run, or labeled replay, and why the operator chose that rung.

## User Workflow

- Start with low-cap live mode.
- Monitor provider/run health.
- Manually switch to prepared known-good run if needed.
- Manually switch to labeled replay if providers or timing fail.
- Run rehearsals for provider failure, fallback, evidence walkthrough, and boot validation.

## Required Data / Events

- `RunConfig`, `RunCaps`
- `run.started`, `run.stopped`, terminal events
- provider failure events
- replay fixture metadata
- `GET /runs/:id/health`
- live/replay mode state
- demo runbook and rehearsal scripts

## Acceptable Fixture

Use one committed replay fixture and one simulated provider-failure fixture. The prototype may be local-only and does not require hosted deployment.

## Convincing Demo Bar

- Fallback is visibly operator-driven.
- Replay is clearly labeled as replay.
- The ladder never mutates prior rung events.
- Low-cap override can only lower caps.
- The demo can boot locally with hosted providers and Langfuse unavailable.

## Falsification Bar

This prototype fails if replay is disguised as live, if switching rungs rewrites history, if the operator cannot decide quickly, or if a provider outage kills the whole showcase.

## Graduation Path

Wire the ladder into the live operator console and dashboard mode indicator. Production should keep the same honesty contract even when hosted deployment is added.

