# /tdd brief — model_gateway_port

## Feature
Define the `ModelGateway` **port** in `apps/api` — the single provider seam domain/runtime code depends on — as a TypeScript interface over the frozen `@doppl/contracts` wire contracts (`ModelGatewayRequest`/`ModelGatewayResponse` + `ModelRole`/`ProviderCapability`/`ModelRoute`). No vendor SDK type appears in the port surface; domain importers depend on contracts alone (key safety rule #9). Conformance is pinned with the P0.14 canonical fixtures so a frozen-shape change breaks the kernel loudly.

## Use case + traceability
- **Task ID:** P2.1 (kernel-side **adopt** of the §6 gateway wire contracts + define the port interface — the contracts were authored + snapshot-pinned in the Phase 0 contract track, so this slice consumes, it does NOT re-author them)
- **Architecture sections it implements:** `ARCHITECTURE.md §6` (ModelGateway port; "domain/runtime code calls a `ModelGateway` port and sees only `ModelGatewayRequest/Response` + `ProviderCapability`")
- **Related context:** bootstrap slice `kernel-001` (P1.1) landed `1c301b1` — `apps/api` builds + runs Vitest. The frozen contracts live in `packages/contracts/src/gateway/{gateway-request,gateway-response,model-role,model-route,provider-capability,provider-meta}.ts` (exported from the `@doppl/contracts` barrel). Module org: the port lives under `apps/api/src/model-gateway/` (area `CLAUDE.md` "Module organization"). Freeze-bundle slice; its existence lets the gateway-stub sub-chain (P2.4 → P2.9) and the downstream tracks fork against a typed seam.

## Acceptance criteria (what "done" means)
- [ ] `apps/api/src/model-gateway/port.ts` exports a `ModelGateway` interface whose call method takes a `ModelGatewayRequest` and returns `Promise<ModelGatewayResponse>` (both imported from `@doppl/contracts`)
- [ ] The port exposes per-role capability access returning a `ProviderCapability` for a given `ModelRole` (so domain code can branch on `structuredOutputs`/`embeddings` without touching a provider)
- [ ] The port type surface imports **only** from `@doppl/contracts` — no vendor SDK type (`openai`/`@anthropic-ai`/`openrouter`) appears anywhere in the port or its barrel (rule #9; forbidden-pattern #2)
- [ ] The port carries **no credential field** and no way to pass a provider key through it — keys load from env only (key safety rule #4); the frozen Request/Response already make this unrepresentable
- [ ] `apps/api/src/model-gateway/index.ts` barrel re-exports the `ModelGateway` port type and (per Step-2.5 Q3) the adopted gateway contract types, giving the runtime one internal seam-import surface
- [ ] Port-conformance unit tests in `apps/api/test/unit/model-gateway/port.test.ts` pass against the P0.14 `CANONICAL_FIXTURES` (a frozen-shape change breaks them)
- [ ] `typecheck` clean (the port is type-only; `tsc` IS the enforcement that the I/O types are the frozen contracts) and `/preflight` clean
- [ ] No vendor adapter, no validation logic, no registry in this slice (those are P2.4/P2.5/P2.2) — port interface + barrel + conformance test only

## Wiring / entry point (Step 7.5)
The `ModelGateway` is a port (interface) — it has no runtime entry point of its own. Its first concrete implementation is the recorded/fake gateway stub (P2.9) and the OpenRouter adapter (P2.5); its first consumer is the runtime generation loop (P3). So: `none — first implementation lands in P2.9, first consumer in P3`. The conformance test exercises the port shape via an in-test minimal fake so the seam is proven correct now, ahead of its implementations (the whole point of defining it in the freeze bundle).

## Files expected to touch
**New:**
- `apps/api/src/model-gateway/port.ts` — the `ModelGateway` interface over the frozen contracts
- `apps/api/src/model-gateway/index.ts` — model-gateway barrel (port + adopted gateway types, per Q3)
- `apps/api/test/unit/model-gateway/port.test.ts` — port-conformance tests

**Modified:**
- none (the package barrel `src/index.ts` need not export an internal backend seam; revisit at Q3 if you decide the port should be part of the package's public surface — flag at Step 2.5)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests to write in `apps/api/test/unit/model-gateway/port.test.ts` (use `CANONICAL_FIXTURES` from `@doppl/contracts` — P0.14 consumer-agreement surface):

1. **`test_port_call_returns_contract_response`** — a minimal in-test fake implementing `ModelGateway` whose call resolves the canonical `ModelGatewayResponse` fixture.
   - Asserts: `ModelGatewayResponse.safeParse(await fake.call(canonicalRequest)).success === true`.
   - Why: pins the port's return type IS the frozen §6 `ModelGatewayResponse` (a field change in the frozen contract fails this loudly — P0.14 agreement).

2. **`test_port_accepts_contract_request`** — the port's call signature accepts the canonical `ModelGatewayRequest`.
   - Asserts: `ModelGatewayRequest.safeParse(canonicalRequest).success === true` AND the fake's call accepts it without a type error (compile-time, exercised by the test compiling + running).
   - Why: pins the request seam is the frozen §6 `ModelGatewayRequest`.

3. **`test_capability_lookup_returns_provider_capability`** — the fake's per-role capability accessor returns a `ProviderCapability`-valid object for a valid `ModelRole`.
   - Asserts: `ProviderCapability.safeParse(fake.capabilityFor('embedding')).success === true`.
   - Why: §6 capability matrix is exposed through the port (so domain branches on capability, not provider).

   *(Acceptance bullet "no vendor SDK type in the port surface" is not a unit assertion — it is enforced by `typecheck` + import review now, and by the §2.5 dependency-boundary lint when that lands; note it as `not-tested-because: structural, typecheck + import review` in the coverage map.)*

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none — consumes frozen `@doppl/contracts` gateway models; no Appendix-A model is touched.
- **Orchestrator doc rows to write hot (Step 9 routing):** none anticipated.
- **Shared-contract seam model touched?** The port *consumes* the §2.5-seam gateway contracts but does not redefine or extend them — the field-set snapshots already live in `packages/contracts` (P0.11/P0.12, contract track). So **no new schema-snapshot in apps/api**; instead the port-conformance test uses `CANONICAL_FIXTURES` as the kernel-side consumer-agreement pin (per the area `CLAUDE.md` cross-doc note). If you find the port needs a contract field that doesn't exist, that is a **cross-track Finding** (frozen contract) → flag at Step 2.5, never edit the contract here.

## Things to flag at Step 2.5
1. **Port method name + shape.** `call(request: ModelGatewayRequest): Promise<ModelGatewayResponse>` vs `complete(...)`/`invoke(...)`. The frozen `ModelGatewayRequest` already carries `role`, so the port takes the whole request (role-in-request routing), not a separate role arg. My default vote: **`call(request)`** + role lives in the request (matches the frozen contract; no redundant role param).
2. **Capability accessor shape.** `capabilityFor(role: ModelRole): ProviderCapability` (lazy, registry-backed in P2.2) vs a `capabilities: Record<ModelRole, ProviderCapability>` map. My default vote: **`capabilityFor(role)`** — a method defers the registry wiring to P2.2 cleanly and avoids implying an eagerly-materialized map this slice can't yet populate.
3. **Barrel re-export scope.** Re-export the adopted gateway contract types (`ModelGatewayRequest/Response`, `ModelRole`, `ProviderCapability`, `ModelRoute`) from `apps/api/src/model-gateway/index.ts` so runtime/verifier import the seam from one apps/api path, vs. importing them directly from `@doppl/contracts`. My default vote: **re-export from the model-gateway barrel** (one internal seam surface) while `@doppl/contracts` stays the single definition source (no redefinition — lesson §5). Keep the port OUT of the package public barrel `src/index.ts` (it's backend-internal).
4. **Conformance fixtures source.** `CANONICAL_FIXTURES` (P0.14) vs hand-built fixtures. My default vote: **`CANONICAL_FIXTURES`** — it is the project's consumer/producer-agreement mechanism (area `CLAUDE.md` cross-doc note); a frozen-shape drift then breaks the kernel's port test, which is exactly what we want.

## Dependencies + sequencing
- **Depends on:** bootstrap `kernel-001` (P1.1, landed `1c301b1`); frozen `@doppl/contracts` gateway contracts (P0.11/P0.12).
- **Blocks:** P2.4 (structured-output discipline implements against this port + a minimal gateway shell), P2.9 (fake stub implements this port), P2.5/P2.6/P2.7 (adapters implement it), P3 runtime (first consumer). It is the gateway sub-chain's root in the freeze bundle.

## Estimated commit count
**1.** Thin port-adopt slice (interface over frozen contracts + conformance test). Non-invariant (no rule #1–#9 *implementation* — it defines the seam that later slices enforce), so no isolation requirement; one `feat(model-gateway):` commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "a provider/subsystem seam is defined as a TS interface over the frozen contracts and conformance-tested via `CANONICAL_FIXTURES`; the seam's first implementation + first consumer land in later slices, so its Step-7.5 wiring is the explicit-deferral form."
- **Architecture-doc note candidate** — none anticipated (§6 already specifies the port surface).

## How to invoke
1. **Read this brief end-to-end** — the session is already oriented (bootstrap was slice-0), so jump straight in.
2. **Run `/tdd model_gateway_port`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 4 design questions (or take defaults), send the Step-2.5 write-up.
5. **Step 9** — surface anything beyond the anticipated lessons candidates.
