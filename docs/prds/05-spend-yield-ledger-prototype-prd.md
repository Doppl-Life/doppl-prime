# PRD 05: Spend / Yield Ledger Prototype

## Prototype Question

Can Doppl connect paid model/tool spend to output yield so future runs can allocate energy and dollars toward strategies that actually open the idea space?

## Audience Moment

Within 10 seconds, a viewer should understand which strategies cost money, which produced selected fruits, and which created the best quality or space-opening per dollar.

## User Workflow

- See total spend and paid call count.
- Compare generated sprouts, selected fruits, and average space opening.
- Inspect strategy conversion across attempts, fruits, space score, cost, and space per dollar.
- Review run-watch notifications.
- Inspect top space-opening outputs.

## Required Data / Events

- ModelGateway provider metadata
- cost events or trace metadata
- `candidate.created`
- `fitness.scored`
- `novelty.scored`
- strategy labels / agenome ids
- selected/carry-forward markers
- scoring policy version

## Acceptable Fixture

Historical fixtures may be marked as unmetered when exact provider cost was not captured. Estimated costs must not be presented as exact.

## Convincing Demo Bar

- Spend is not vanity telemetry; it changes allocation decisions.
- Outputs are classified as sprouts or fruits.
- Strategy-level conversion is visible.
- Missing exact costs are honestly labeled.
- The ledger suggests what Doppl should try more or less of next.

## Falsification Bar

This prototype fails if cost is detached from quality, if selected outputs cannot be traced to strategies, or if unmetered data masquerades as exact accounting.

## Graduation Path

Persist provider cost metadata from ModelGateway into events/traces and derive the ledger from the event store. Production should support exact provider usage where available and clear degraded labels where not.

