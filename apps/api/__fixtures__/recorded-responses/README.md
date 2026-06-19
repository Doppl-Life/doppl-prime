# Recorded gateway fixtures

JSON fixtures the `RecordedGateway` (U9) loads at lookup time. Layout:

```
<adapter>/
└── <role>/
    ├── default.json
    └── <inputHash>.json
```

Each fixture is a `ModelGatewayResponse`:

```json
{
  "ok": true,
  "output": { "...": "..." },
  "repairAttempts": 0,
  "providerTraceId": "trace_recorded",
  "langfuseObservationId": "obs_recorded",
  "energyEstimate": 10,
  "energyActual": 8
}
```

The lookup key is `(role, hashOf(request.input))`. `RecordedGateway`
falls back to `default.json` for the role when no input-keyed fixture
is present. A missing fixture throws `RecordedFixtureNotFoundError`
with the resolved path in the message.

## How to author a fixture

1. Decide which adapter + role you're recording for.
2. Construct a representative `ModelGatewayResponse` JSON value.
3. Save it at `<adapter>/<role>/default.json` (or per-input hash).

A future `pnpm scripts/record-fixtures.ts` (deferred) will dump
fixtures from a live `pnpm test:live` run.
