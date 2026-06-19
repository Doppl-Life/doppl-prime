# PRD 08: Model Gateway / Structured Output Repair Prototype

## Prototype Question

Can Doppl show that every model call passes through one accountable gateway with structured validation, one repair attempt, rejection events, provider metadata, and fallback behavior?

## Audience Moment

Within 10 seconds, a viewer should understand that model output is not trusted blindly. It is requested, validated, repaired at most once, accepted or rejected, and persisted with metadata.

## User Workflow

- Inspect a gateway call lifecycle.
- See request purpose, provider route, model id, schema target, and trace id.
- Compare raw response, validation result, repair attempt, and final accepted/rejected payload.
- Trigger or view fallback route behavior.
- See cost and latency metadata.

## Required Data / Events

- `ModelGatewayRequest`
- `ModelGatewayResponse`
- `ProviderCapability`
- `provider_call_failed`
- `output_schema_rejected`
- accepted / repaired structured-output metadata
- provider trace ids, tokens, cost, latency

## Acceptable Fixture

Use recorded gateway transcripts that include one accepted response, one repaired response, one rejected response, and one provider fallback. No live provider calls are required for the prototype.

## Convincing Demo Bar

- The validation boundary is obvious.
- Repair is limited and auditable.
- Rejection is treated as a first-class event, not hidden.
- Provider metadata is preserved without leaking secrets.
- The runtime remains provider-agnostic.

## Falsification Bar

This prototype fails if model calls feel like hidden magic, if schema repair can loop indefinitely, or if a provider-specific SDK leaks into the runtime mental model.

## Graduation Path

Connect the prototype to the real ModelGateway port and recorded call metadata. Production should expose this view as an operator/debug panel and as trace evidence for replay.

