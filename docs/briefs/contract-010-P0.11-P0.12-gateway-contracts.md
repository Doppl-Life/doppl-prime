# /tdd brief — gateway_contracts (BUNDLE: P0.11 + P0.12)

## Feature
Freeze the ModelGateway seam (§6) as one bundled slice — the **only** provider surface domain code sees (no vendor SDK types leak). **P0.11:** `ModelRole` (closed 7-role union), `ProviderCapability` ({structuredOutputs, embeddings, toolCalling?, streaming?}), `ModelRoute` ({role, provider, modelId, capability, fallbackRouteIds[]}). **P0.12:** `ModelGatewayRequest` ({role, messages/prompt, schema?, maxTokens?}), `ModelGatewayResponse` ({accepted, output?, validationResult, providerMeta, langfuseTraceId?, rejection?}). NON-safety leaf data shapes — **BUNDLED** per the standing P0 directive; each model keeps its own red→green; P0.12 deps P0.11 (satisfied within the bundle). `ModelGatewayResponse.providerMeta` **imports the shared `ProviderMeta`** frozen in P0.9 (lesson §5 — Carry-forward).

## Use case + traceability
- **Task ID:** P0.11 + P0.12 (bundled).
- **Architecture sections it implements:** `ARCHITECTURE.md §6` (gateway is the only provider seam; roles `population_generator`/`critic`/`subtype_check`/`embedding`/`final_judge`/`fusion_synthesis`/`retrieval`; capability matrix MVP-lean = structuredOutputs + embeddings day-one, toolCalling/streaming + multi-hop fallback later; structured outputs validated → **accepted / repaired (≤1) / rejected** with an event; providerMeta + Langfuse IDs persisted; embeddings pinned direct-OpenAI while others route via OpenRouter — schema does not force a single provider), §2.5 (import-direction: Request/Response are the only seam), §14 (no credential field — env-only). Appendix A line 479 (`ModelRoute`/`ModelRole`/`ProviderCapability`) + 480 (`ModelGatewayRequest`/`Response`).
- **Related context:** `ModelGatewayRequest.role` is a `ModelRole` (P0.11→P0.12 internal dep). `ModelGatewayResponse.providerMeta` = the shared `ProviderMeta` from P0.9 (`src/gateway/provider-meta.ts`) — **import, do NOT redefine** (lesson §5; Carry-forward). `src/gateway/` already exists (P0.9). NON-safety, but the §14 no-credential-field property is pinned structurally (strict + negative test). Lesson §6 (ranges/relationships → kernel), §10 (positive-guard-first), §1 (strict + closed-union + snapshot).

## Acceptance criteria (what "done" means)
**P0.11:**
- [ ] `ModelRole` is the CLOSED 7-member union `population_generator | critic | subtype_check | embedding | final_judge | fusion_synthesis | retrieval`; any other rejected.
- [ ] `ProviderCapability` is strict: `structuredOutputs` + `embeddings` REQUIRED booleans (day-one gate flags); `toolCalling?` + `streaming?` OPTIONAL booleans; unknown rejected.
- [ ] `ModelRoute` is strict: `role` (ModelRole), `provider` (open string), `modelId` (open string), `capability` (ProviderCapability), `fallbackRouteIds` (array of route-id strings, MAY be empty — multi-hop added later, §6); unknown rejected.
- [ ] The schema does NOT force a single provider (an embedding route pinned to OpenAI + a critic route via OpenRouter both validate) — §6 routing.

**P0.12:**
- [ ] `ModelGatewayRequest` is strict: `role` (ModelRole), the prompt content per Q1, `schema?`, `maxTokens?`; unknown rejected; carries NO credential/secret field (§14).
- [ ] `ModelGatewayResponse` is strict: `accepted` (boolean), `output?`, `validationResult`, `providerMeta` (shared `ProviderMeta`), `langfuseTraceId?`, `rejection?`; unknown rejected; carries NO credential/secret field (§14).
- [ ] `validationResult` expresses the CLOSED `accepted | repaired | rejected` structured-output outcome (Q2); the `accepted`↔`validationResult` correlation per Q2.
- [ ] **`rejected ⇒ rejection`:** a response whose `validationResult` is `rejected` MUST carry a `rejection` (with a reason); accepted/repaired need none (Q3 — mirrors P0.7 skipReason).
- [ ] `ModelGatewayResponse.providerMeta` is the shared `ProviderMeta` imported from P0.9 (not redefined) — a malformed/secret-bearing providerMeta is rejected (inherits P0.9's no-secret pin).

**Both:**
- [ ] `z.infer` types for all five (+ enums) exported from the barrel; `ProviderMeta` reused (not re-exported anew).
- [ ] **Schema-snapshot tests (§2.5 gate, tagged `spec(§6)`):** `ModelRole`(7) + `ProviderCapability` field-set + `ModelRoute` field-set + `ModelGatewayRequest` field-set + `ModelGatewayResponse` field-set + `validationResult` member-set equal frozen snapshots.
- [ ] All unit tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel exports `ModelRole`, `ProviderCapability`, `ModelRoute`, `ModelGatewayRequest`, `ModelGatewayResponse` (schemas + `z.infer` types) + the `validationResult` enum. Consumed by the **kernel/model-gateway track (P2/P3)** — the `ModelGateway` port speaks exactly Request/Response; domain code never sees a vendor SDK type. `none — the gateway adapter implementation lands in the model-gateway track (P2)`. Reachability = barrel-exported + schema-snapshot-covered.

## Files expected to touch
**New:**
- `packages/contracts/src/gateway/model-role.ts` — `ModelRole`.
- `packages/contracts/src/gateway/provider-capability.ts` — `ProviderCapability`.
- `packages/contracts/src/gateway/model-route.ts` — `ModelRoute`.
- `packages/contracts/src/gateway/gateway-request.ts` — `ModelGatewayRequest`.
- `packages/contracts/src/gateway/gateway-response.ts` — `ModelGatewayResponse` (+ `validationResult` enum).
- `packages/contracts/test/gateway/{model-role,provider-capability,model-route,gateway-request,gateway-response}.test.ts`
- `packages/contracts/test/__schema-snapshots__/gateway-field-sets.test.ts`

**Modified:**
- `packages/contracts/src/index.ts` — re-export the above.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**P0.11:**
1. **`model_role_closed_7_union`** *(spec §6)* — Asserts: all 7 roles parse; `'judge'`/`''` rejected.
2. **`provider_capability_strict`** *(spec §6)* — Asserts (positive-guard-first): structuredOutputs+embeddings required booleans; toolCalling?/streaming? omittable; unknown rejected; non-boolean rejected.
3. **`model_route_strict_and_multiprovider`** *(spec §6)* — Asserts: full ModelRoute round-trips; `fallbackRouteIds:[]` ok; an embedding-role route (provider OpenAI) AND a critic-role route (provider OpenRouter) both parse (no single-provider forcing); unknown rejected; bad `role`/`capability` rejected.
**P0.12:**
4. **`gateway_request_strict_and_role`** *(spec §6)* — Asserts (positive-guard-first): full Request round-trips; `role` is a ModelRole (bad role rejected); prompt content per Q1; `schema?`/`maxTokens?` omittable; unknown rejected; **a `apiKey`/`secret` field rejected** (§14 no-credential).
5. **`gateway_response_strict_and_providerMeta`** *(spec §6)* — Asserts: full Response round-trips; `providerMeta` is the shared `ProviderMeta` (a malformed/secret-bearing providerMeta rejected); unknown rejected; a `secret` field rejected (§14).
6. **`gateway_validationResult_closed`** *(spec §6)* — Asserts: `accepted`/`repaired`/`rejected` parse; other rejected; the `accepted`↔`validationResult` correlation per Q2.
7. **`gateway_rejected_requires_rejection`** *(spec §6)* — Asserts: `validationResult:'rejected'` WITHOUT `rejection` rejected; with `rejection{reason}` accepted; accepted/repaired need none. Why: a rejection is always explained (mirrors P0.7 skipReason).
**Both:**
8. **`barrel_exports_gateway_contracts`** *(spec §2.5)* — Asserts: all 5 + the validationResult enum re-exported; `ProviderMeta` resolves from the barrel.
9. **`schema_snapshot_gateway`** *(spec §6/§2.5)* — Asserts: ModelRole(7) + ProviderCapability + ModelRoute + ModelGatewayRequest + ModelGatewayResponse field-sets + validationResult(3) == frozen snapshots.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NEW — `ModelRole`, `ProviderCapability`, `ModelRoute`, `ModelGatewayRequest`, `ModelGatewayResponse` (+ `validationResult` enum). Reuses `ProviderMeta` (P0.9).
- **§2.5-seam model touched?** **YES** — all five shared (gateway→runtime/verifier/selection). RED outline MUST include the snapshots (#9).
- **Orchestrator doc rows to write hot:** cross-doc rows for the 5 models (§6). Appendix A 479/480 already enumerate the fields (480 already notes providerMeta = shared ProviderMeta from my P0.9 routing) — no ARCHITECTURE.md edit unless GREEN settles an under-specified type (e.g. the Q1 messages/prompt shape, Q3 rejection shape) → arch note at Step 9.

## Things to flag at Step 2.5
1. **`ModelGatewayRequest` prompt content — `messages` array vs `prompt` string (Appendix A says "messages/prompt").** My default vote: model BOTH as optional with a refine requiring **exactly one** — `prompt?: z.string().min(1)` XOR `messages?: z.array(z.object({role: <chat-role>, content: z.string()}))`, where the chat-role is a closed `system | user | assistant` enum (distinct from `ModelRole`). This supports rule-#5 isolation (candidate text goes in a `user` message via `wrapUntrusted`). Flag if you'd rather a `z.union` or prompt-only for MVP.
2. **`validationResult` shape + `accepted` correlation.** My default vote: `validationResult` = closed enum `accepted | repaired | rejected`; `accepted` boolean; enforce the correlation `accepted === (validationResult !== 'rejected')` via `.superRefine` (so the two can't disagree). The "≤1 repair" bound is a RUNTIME invariant (the gateway repairs at most once), NOT a contract field. Flag if you want a `repairCount?` field or to drop the correlation refine.
3. **`rejection` shape + conditional requirement.** My default vote: `rejection?: z.strictObject({ reason: z.string().min(1) })` (extensible later); REQUIRED iff `validationResult==='rejected'` via `.superRefine` (flat + refine, mirrors P0.7). Flag if rejection needs more fields (e.g. the failed validation detail).
4. **`output?` typing.** My default vote: `z.unknown().optional()` — the validated structured output is request-specific (the Request carries the `schema?` it was validated against); a generic here is correct (the per-request shape isn't a frozen contract). Flag if you'd rather `z.record(z.string(), z.unknown())`.
5. **`schema?` (Request) typing.** My default vote: `z.unknown().optional()` — it carries an opaque schema descriptor (a Zod/JSON schema); the contract can't meaningfully type "a schema". Flag.
6. **`maxTokens?` typing.** My default vote: `z.int().positive().optional()`.
7. **No-credential pin (§14).** My default vote: strict on both Request + Response makes a credential field unrepresentable; pin with a negative test rejecting `apiKey`/`secret` (+ ProviderMeta's existing no-secret pin from P0.9). This is the bundle's one §14 touch.
8. **Commit count.** My default vote: **1 (BUNDLE)** — five gateway-seam leaf shapes, non-safety, one cohesive §6 family; each model its own red→green, one Step-10 commit. Commit: `feat(contracts): gateway seam — ModelRoute/Role/Capability + GatewayRequest/Response (P0.11, P0.12)`.

## Dependencies + sequencing
- **Depends on:** P0.9 (imports shared `ProviderMeta` — landed `a13d9cc`). (P0.12 deps P0.11, satisfied within the bundle.)
- **Blocks:** P0.14 (contract-test surface), the model-gateway track (P2) + everything that calls the gateway (P3/P4/P5).

## Estimated commit count
**1 (BUNDLE).** Per the standing P0 directive: `[P0.11+P0.12]` is the gateway bundle — non-safety leaf shapes, one cohesive §6 family. Each of the 5 models gets its own red→green; the bundle ends in one Step-10 commit.

## Step-8 reviewer policy
**security-reviewer: FAN OUT** — the bundle's §14 no-credential-field property (rule #4) is the trigger (invariant-touching). Thin surface: confirm no credential/secret field is representable on Request/Response/providerMeta, and the Request/Response are the only seam (no vendor type leak). code-quality-reviewer stays `phase-boundary`.

## Lessons-logged candidates anticipated
- **Convention candidate** — likely none new (reuses §1 strict/closed/snapshot, §5 shared-type import, §6 permissive, the P0.7 conditional-required-refine pattern). If the messages/prompt XOR modeling proves reusable, may note it.
- **Architecture-doc note candidate** — settle the Q1 messages/prompt + Q3 rejection shapes in Appendix A 480 if GREEN pins them.

## How to invoke
1. **Read this brief end-to-end.** Q1 (messages/prompt), Q2 (validationResult correlation), Q3 (rejected⇒rejection) are the load-bearing calls.
2. **Run `/tdd gateway_contracts`.**
3. **Step 0/1** — confirm restatement + the 5-model file list; confirm `ModelGatewayResponse.providerMeta` IMPORTS the P0.9 `ProviderMeta` (not redefined) and `ModelGatewayRequest.role` is a `ModelRole`.
4. **Step 2.5** — send the test-design write-up (per-test `Asserts` + per-acceptance-bullet coverage map, both task IDs) + answers to the 8 questions. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 7→8** — security-reviewer fans out (the §14 no-credential touch).
6. **Step 9** — categorized flags + ship-ask (one commit for the bundle).
