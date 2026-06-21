# LESSONS.md — Doppl (the backend (Doppl kernel + subsystems))

> Full prose for every lesson logged during work in `apps/api/`. The compact index lives in `apps/api/CLAUDE.md` "Lessons logged" table.
>
> **Lesson numbers are stable IDs.** New lessons get the next sequential number. Numbers may be referenced from code comments, commit messages, and cross-references between lessons. **Don't reorder; don't reuse a deleted number's slot.**
>
> **Lessons start at §1.** Each code area has its own lesson sequence — lessons don't carry across code areas.

---

## Lesson format

```markdown
## <a id="N"></a>N. <Short topic> — <one-line rule>

**Date:** YYYY-MM-DD.
**Source slice:** <slice-id or commit hash>.

<2-5 paragraphs explaining: what was discovered, why it matters, how to
apply the rule, what edge cases are still open. Cite file:line references
where applicable.>

**Rule:** <one-sentence summary, same as the heading subtitle>.
```

---

## <a id="1"></a>1. Shared contracts are strict closed schemas — `z.strictObject` + `z.enum`, each pinned by a reject-out-of-set test AND a member-set snapshot

**Date:** 2026-06-20.
**Source slice:** contract track P0.1 (`022e9ff`); `packages/contracts`.

Zod's `z.object()` **strips** unknown keys by default — a silent contract hole: an event carrying a stray field would parse, quietly drop the field, and flow downstream as if valid. Every shared contract object therefore uses `z.strictObject({...})` (Zod 4; the v3 `.strict()` is deprecated) so an unknown field is **rejected**, not stripped. Closed unions (`RunEventType`, `Actor`, and every state-machine status union to come) use `z.enum([...])` so an out-of-set value is rejected at the boundary rather than silently admitted.

Because these are §2.5 shared contracts frozen before the tracks fork, a field/member add/remove/rename must surface as a cross-track regression. The schema-snapshot test does this: it asserts the object's field-name set (`Object.keys(Schema.shape)`) and each enum's member set (`Schema.options`) equal a checked-in frozen snapshot, tagged `spec(§4)`. The snapshot guards the *shape*; pair it with a reject-out-of-set test that guards *closure* (the snapshot alone won't catch a union that silently stopped rejecting). Both are required on every contract slice — Step 2.5 confirms both are present.

Edge case still open: the snapshot freezes the field *set*, not each field's value-type — e.g. a `payload` loosened from `z.record(...)` to `z.unknown()` passes the snapshot unchanged. Pin value-type decisions with a dedicated negative test (`envelope_rejects_non_object_payload` in P0.1).

**Rule:** Shared contracts = `z.strictObject` (unknown keys rejected) + closed unions = `z.enum`; each pinned by BOTH a reject-out-of-set test and a member-set/field-name snapshot tagged `spec(§X)`.

## <a id="2"></a>2. Greenfield package toolchain shape — workspace globs + strict `tsconfig.base` + per-package scripts + root `pnpm -r` delegation; TS6 `paths` resolve without `baseUrl`

**Date:** 2026-06-20.
**Source slice:** contract track P0.1 (`20ca1f3`); `packages/contracts`.

The monorepo bootstrap pattern every later package (`apps/api`, `packages/observability`) copies: `pnpm-workspace.yaml` globs `packages/*` + `apps/*`; a root `tsconfig.base.json` carries the strict family (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`) and each package `tsconfig.json` extends it; each package owns its `lint`/`format:check`/`typecheck`/`test` scripts; the root `package.json` delegates via `pnpm -r --if-present` so `/preflight` runs identically from the repo root or a package dir (`--if-present` keeps a package lacking a given script from failing the recursion).

Gotcha (TypeScript 6): `baseUrl` is deprecated and **errors** under TS6 — `paths` now resolve **without** `baseUrl`. Configure `paths` directly and do not set `baseUrl`.

Gotcha (Prettier): `prettier --write .` from the repo root reflows EVERY file unless `.prettierignore` scopes it — in this slice it reflowed 63 repo-wide docs before recovery. `.prettierignore` must exclude `**/*.md`, `docs/`, `.claude/`, `.scaffolding/` so Prettier governs code only.

**Rule:** New packages copy the P0.1 toolchain shape (workspace globs + strict `tsconfig.base` + per-package scripts + root `pnpm -r --if-present`); set `paths` without `baseUrl` (TS6); scope `.prettierignore` to code only.

## <a id="3"></a>3. Secret-redaction scrub — anchored+length-gated value-pattern + sensitive-key whole-value + secret-key de-collision; over-redact but never corrupt

**Date:** 2026-06-20.
**Source slice:** contract track P0.2 (`4b5db40`); `packages/contracts/src/security/redaction.ts`.

The persistence-boundary scrub (§14, key safety rule #4) is pure, idempotent, structure-preserving, non-mutating, and emits normal-prototype output. It runs **before append** and **before Langfuse emit**, so its output *is* the persisted truth — which forces two competing constraints: it must never miss a secret (leak) AND never corrupt legit data (a false-positive is permanent in the log).

Layering: (1) **value-pattern** match for provider keys + Authorization headers — but the pattern MUST be **word-boundary-anchored + length-gated** (`\bsk-[A-Za-z0-9_-]{20,}\b`, `Bearer\s+…{20,}`) or it corrupts prose (`"risk-assessment"` → `"ri[REDACTED]"`); (2) **sensitive key-name** match (case-insensitive contains over `{authorization, api_key, apiKey, secret, token, access_token, client_secret, password}`) that redacts the ENTIRE value regardless of type, so a format-less secret nested under a sensitive key can't escape; (3) secret object **KEYS** are scrubbed too, with **de-collision** (`[REDACTED]`, `[REDACTED]#2`, …) so two redacted-key siblings don't collapse and lose data. Posture: **over-redact** under sensitive keys (a false-positive there is safe; a missed secret is not) — but keep value-pattern matching **precise** (anchored) to protect persisted prose.

The **env-VALUE** layer (comparing payload strings against the actual loaded `process.env` secrets) cannot live in the pure contracts package (no env access, §9 layer rule) — it lands at the boundary (P1 event-store + observability). Security-review the scrub adversarially: this slice took 3 rounds (secret-as-KEY leak, case-sensitivity, `__proto__` data-key drop, key-collision data-loss, null-proto fragility, O(n²) de-collision).

**Rule:** Redaction = anchored+length-gated value-pattern + sensitive-key whole-value + secret-key scrub w/ de-collision; idempotent/structure-preserving/non-mutating/normal-proto; over-redact under sensitive keys but keep patterns precise so persisted prose isn't corrupted; env-value matching lives at the boundary, not the pure package.

## <a id="4"></a>4. `packages/contracts` is pure — all IO (env, file, network, clock) lives at the boundary; validators take loaded sources

**Date:** 2026-06-20.
**Source slice:** contract track P0.2 (`4b5db40`) + P0.3 (`1e4dd4f`).

The contracts package never reads `process.env`, the filesystem, the network, or the clock — it exposes pure functions over data passed in. This surfaced twice: (a) the P0.2 redaction scrub covers key-format + key-name layers, but the **env-value** layer (matching payload strings against the actual loaded `process.env` secrets) can't live here — it lands at the event-store/observability boundary where env loads (human-ratified Option A); (b) P0.3's `validateRunConfig({defaults, file, env})` is a PURE merge+validate — the boot layer does the file/env reads and passes the loaded sources in. The rule generalizes: anything needing ambient IO is plumbed at the infra/boot boundary, never inside `packages/contracts` (§9 layer rule — domain/contracts import only contracts + ports).

Config-merge specifics (P0.3): precedence `defaults < file < env`, **deep** for nested objects (so a layer supplying a partial `caps` overrides one field without wiping the rest), **replace** for arrays + scalars (a higher-layer `enabledSubtypes` replaces, not concatenates). The merge skips JS-internal keys (`__proto__`/`constructor`/`prototype`) — not just pollution-safety: without it a `constructor` config key becomes an own property and `strictObject` throws a confusing `"Unrecognized key: constructor"` boot error while `__proto__` is silently ignored (inconsistent). Validation throws a field-identifying error (wrap `ZodError`) for a clean §15 fail-fast boot message.

**Rule:** Keep `packages/contracts` pure — no env/file/network/clock reads; expose pure functions over loaded sources, and plumb all ambient IO at the boot/infra boundary. Config validators: deep-merge objects / replace arrays+scalars under `defaults<file<env`, skip JS-internal keys, throw field-identifying errors.

## <a id="5"></a>5. A union/type shared by ≥2 models is defined once in its own module and imported — never redefined per model

**Date:** 2026-06-20.
**Source slice:** contract track P0.3 (`1e4dd4f`); `packages/contracts/src/domain/subtype.ts`.

The `Subtype` closed union (`cross_domain_transfer | zeitgeist_synthesis`) is used by `RunConfig.enabledSubtypes` (P0.3) AND `CandidateIdea.subtype` + the discriminated `subtypePayload` (P0.5). Defining it twice would risk divergence (a member added in one place, missed in the other) — a silent cross-model contract break. So the first slice that needs a shared union defines it canonically in its own module (`src/domain/subtype.ts`), exports it from the barrel, and later models import it. This is the §4 single-source-of-truth invariant ("no model is redefined outside contracts") applied at the sub-union level.

**Rule:** When a closed union/type is shared by ≥2 Appendix-A models, define it once in its own module, export from the barrel, and import everywhere — never redefine it per model.

## <a id="6"></a>6. A schema encodes SHAPE, not kernel rules — count/range/clamp invariants live in the kernel, the contract stays permissive

**Date:** 2026-06-20.
**Source slice:** contract track P0.4 (`bdf3816`); `packages/contracts/src/domain/agenome.ts`.

Tempting to encode every rule in the Zod schema. Don't. The contract pins the *structural* shape (field set, types, closed unions, required/optional); behavioral invariants that the kernel polices — counts, ranges, clamps, cross-record relationships — stay OUT of the schema. `Agenome.parentIds` is `array(string)` with NO 0–2 enforcement (the 0–2 relationship is a §3 kernel rule); `spawnBudget` is just a non-negative int hint (the clamp to `min(remaining caps)` is the P3 kernel's job, key safety rule #1). Two reasons: (1) the kernel is the single enforcement point — duplicating a rule in the schema risks the two drifting; (2) if a buggy producer emits an out-of-range value, you want the **kernel to reject it with a persisted event** (auditable), not the schema to throw opaquely at the boundary and mask where the bug came from. The schema is permissive on exactly what the kernel will police.

Corollary (the inverse): values that are purely structural — closed unions, required fields, strict unknown-key rejection, non-empty ids — DO belong in the schema (that's its job). The line is: *structural validity* → schema; *behavioral/relational invariants the kernel owns* → kernel (+ event on violation).

**Rule:** Encode structural shape in the contract (fields, types, closed unions, strict); leave count/range/clamp/relationship invariants to the kernel, which rejects violations with a persisted event — never duplicate a kernel rule in the schema.

## <a id="7"></a>7. A correlated field pair (discriminant + its dependent payload) is a `z.discriminatedUnion` — the correlation is structurally unrepresentable-when-wrong, not checked post-hoc

**Date:** 2026-06-20.
**Source slice:** contract track P0.5 (`49f77f3`); `packages/contracts/src/domain/candidate-idea.ts`.

`CandidateIdea` carries both a `subtype` discriminant AND a `subtypePayload` that must match it (`cross_domain_transfer` ⟺ `CrossDomainTransferPayload`, `zeitgeist_synthesis` ⟺ `ZeitgeistSynthesisPayload`). Modeling this as a flat `z.strictObject` + a `.refine(payload matches subtype)` pushes the correlation into a runtime predicate that (a) can drift from the field set, (b) gives a worse error, and (c) is invisible to the inferred type — a caller could construct a mismatched object in TS. Instead use `z.discriminatedUnion('subtype', [cdtVariant, zeitVariant])`, each variant pinning `subtype: z.literal(Subtype.enum.X)` + its matching payload. A mismatched pair is then *unrepresentable* — rejected by the schema AND a type error in TS — not caught after the fact. This is the structural-validity → schema line from lesson §6: the correlation is structural, so it belongs in the shape.

Two corollaries surfaced and were Step-2.5-approved: (1) the variant literals are `z.literal(Subtype.enum.*)` sourced from the canonical P0.3 `Subtype` (lesson §5) — never re-spelled string literals — so the discriminants can't drift from the shared union; (2) the field-name schema-snapshot for a discriminated union walks `Schema.options` and asserts each variant's `.shape` key-set + the discriminant set, reading the discriminant via a `safeParse` probe (Zod-v4 literals can be multi-value, so `.value` is v3-only) with the expected set sourced from `Subtype.options` — so the snapshot ALSO proves the discriminants ARE the canonical `Subtype` members, catching a Subtype↔CandidateIdea divergence in either direction.

**Rule:** A discriminant + its dependent payload is one `z.discriminatedUnion` (variant literals from the canonical shared union, lesson §5), so a mismatched pair is unrepresentable; snapshot a union by walking `.options` + each variant `.shape`, probing the discriminant via `safeParse` (v4-robust) against the shared union's `.options`.

## <a id="8"></a>8. An injection-isolation contract = trusted-instructions vs untrusted-data as distinct fields + a single-source sentinel-wrap primitive that NEUTRALIZES embedded delimiters

**Date:** 2026-06-20.
**Source slice:** contract track P0.6 (`dfd651f`); `packages/contracts/src/verifier/critic-input.ts`.

`criticInput` models the trusted rubric and the untrusted candidate as DISTINCT named fields, so candidate text is structurally *data to evaluate*, never interpolated into an instruction string (§14 / T-002 / RISK-008, safety rule #5). The single-source wrap primitive — `wrapUntrusted(text)` + the exported `CRITIC_INPUT_SENTINEL` constant — lives IN the frozen contracts package (parallels lesson §3, redaction-in-contract), so every consumer wraps identically rather than each re-implementing (and mis-implementing) isolation.

The load-bearing part: the candidate is **attacker-controlled** (an agenome evolving under selection pressure can emit injection text), and the contract is open-source, so a fixed "collision-unlikely" token defends accidents, not adversaries. `wrapUntrusted` therefore **neutralizes** any occurrence of the sentinel inside `text` (`text.replaceAll(SENTINEL, marker)`) so the output holds the sentinel **exactly twice** (the wrappers) for ANY input — an adversarial candidate cannot forge a delimiter boundary and break out into the instruction region. The neutralization is **provably single-pass-complete**: the marker contains a character ABSENT from the sentinel (so a removed sentinel's neighbours can't splice into a new one) AND the sentinel has no self-overlap (no `<<<`/`>>>` prefix-suffix collision) → no re-scan `while` loop, a linear DoS bound on attacker input. A stronger future hardening — a per-call **nonce** delimiter sourced from the run RNG — belongs to the prompt-rendering layer (verifier track P4), not the pure contract (no RNG here, lesson §4); neutralization is sufficient at the contract tier.

**Rule:** Model trusted instructions vs untrusted data as distinct contract fields + a single-source sentinel-wrap primitive in the frozen package; the wrap MUST neutralize embedded sentinels (output has the sentinel exactly twice for any input), and make that neutralization single-pass-complete (marker holds a char the sentinel lacks; sentinel has no self-overlap) so it's safe AND linear on adversarial input.

## <a id="9"></a>9. An "this actor emits evidence only" invariant is pinned structurally — strict field-set + snapshot make a winner/policy field unrepresentable

**Date:** 2026-06-20.
**Source slice:** contract track P0.6 (`dfd651f`); `packages/contracts/src/verifier/critic-review.ts`.

Critics never select winners, mutate candidates/lineage, or alter the scoring policy (§7, safety rule #6 — anti-reward-hacking). Encode that as the **absence** of any such field rather than a runtime guard: `CriticReview` is a `z.strictObject` of exactly its 7 evidence fields, so a payload adding `winner`/`selected`/`scoreOverride`/`policyVersion` is rejected at parse, and the frozen field-name snapshot makes adding such a field later a caught regression. The invariant becomes a *shape* property — a critic literally cannot express a winner-selection because the contract has no field for it, and there's no enforcement code to forget or bypass. Generalizes to other emit-only actors (the held-out judge, check-runners): pin "can only emit evidence" by giving the shape no authority field.

**Application — rule #8 success-only accounting (P0.9, `a13d9cc`).** The same no-X-field-via-shape technique pins the energy ledger: `EnergyEvent` is a strict object with NO `failed`/`retried`/`repaired`/`success` field and a closed `eventType` (llm/tool/spawn, no failure member), so a failed-attempt energy debit is **unrepresentable** — energy debits only on success; failures are a separate `provider_call_failed` event. `estimate` + `actual` are both required. The snapshot adds a `not-contains` assertion over the forbidden field names for extra clarity (the full field-set snapshot already catches any addition).

**Rule:** Pin an "emit-only / no-authority" invariant structurally — `z.strictObject` of exactly the evidence fields + a field-name snapshot — so an authority field (winner/policy/override) is unrepresentable, not merely rejected by runtime code. (Same technique pins success-only accounting: the spend event has no failure field — rule #8.)

## <a id="10"></a>10. An all-negative (reject-only) test leads with a positive guard so it can't false-pass when the schema/export vanishes

**Date:** 2026-06-20.
**Source slice:** contract track P0.6 (`dfd651f`); `packages/contracts/test/verifier/critic-review.test.ts`.

A test whose every assertion expects *rejection* (e.g. "`winner`/`selected`/`scoreOverride`/`policyVersion` all rejected") can **false-pass** if the schema import is `undefined` — `undefined.parse(x)` throws too, satisfying "expect throw" for the wrong reason. Surfaced in P0.6 confirm-RED. Lead any such test with a **positive guard** (`Schema.parse(validInput)` must SUCCEED) so it fails loudly if the export ever disappears or the schema breaks wholesale. This is load-bearing in a contract-heavy codebase where most slices carry reject-out-of-set / strict-unknown tests.

**Rule:** Any test that is all-negative (every case expects rejection) opens with a positive assertion that a valid input parses, so a vanished/garbage export can't make the rejections false-pass.

## <a id="11"></a>11. An allowlist/registry safety invariant is pinned two ways — non-executing BY SHAPE + a single-source fail-safe gate with own-property lookup

**Date:** 2026-06-20.
**Source slice:** contract track P0.7 (`83db38d`); `packages/contracts/src/checks/check-runner-adapter.ts`.

Key safety rule #3 (no arbitrary code execution; REQ-S-003) is pinned two complementary ways in the frozen contract. (1) **Non-executing BY SHAPE:** `CheckRunnerAdapter` is a `z.strictObject` of pure descriptor fields (`{id, checkType, subtype?, label?}`), so a code-carrying field (`exec`/`command`/`handler`/`fn`/`script`/`code`) is **unrepresentable** — rejected at parse and caught as a regression by the field-set snapshot (lesson §9 applied to rule #3). (2) **Single-source fail-safe gate:** `resolveCheckAdapter(registry, request)` is the one place an adapter id resolves; an unregistered id fails safe to a **schema-valid `skipped` CheckResult** (never executes, never throws).

The load-bearing subtlety: the lookup uses **own-property** semantics (`Object.prototype.hasOwnProperty.call(registry, id)`), not `registry[id]`. A naive `registry[id]` returns truthy `Object.prototype` members for `__proto__`/`constructor`/`toString`/`hasOwnProperty`, **falsely "resolving" a non-adapter and bypassing the allowlist** — verified by the security-reviewer to fail safe to `skipped` even under live `Object.prototype` poisoning. The skip `reason` is a **fixed constant** (`unregistered_adapter`), never the untrusted adapter id (no attacker-controlled-byte reflection, consistent with the "ids are untrusted bytes" rule). Corollary: a conditional-required field is pinned as an **IFF** (`skipReason` present ⟺ `status==='skipped'`) so the nonsensical non-skipped-with-reason state is unrepresentable too.

**Rule:** Pin an allowlist/registry invariant twice — (a) non-executing by shape (`z.strictObject` makes a code field unrepresentable) AND (b) a single-source pure gate that fails safe to a schema-valid skip on an unregistered id, using `hasOwnProperty.call` own-property lookup so `__proto__`/`constructor` ids can't bypass it and never reflecting the untrusted id into the reason.

## <a id="12"></a>12. Immutability-via-versioning is pinned structurally — a source carries a `version`; every artifact it produces carries a REQUIRED `<thing>Version` of identical type

**Date:** 2026-06-20.
**Source slice:** contract track P0.8 (`837e5be`); `packages/contracts/src/scoring/fitness-score.ts`.

Rule #6 (the scoring policy is immutable to agents — anti-reward-hacking) is supported at the contract tier by **versioning, not in-place mutation**. `ScoringPolicy` carries a `version`; `FitnessScore.policyVersion` is REQUIRED and identically typed, so every score is bound to the exact policy that produced it — a score cannot be emitted unbound, and a policy is never edited in place (a change is a new version). This makes selection explainable (a score forever references its policy) and makes "the metric moved under the agents" detectable (a score's `policyVersion` is fixed). Pinned **dually**: the field-set snapshot proves `policyVersion` is present, and a behavioral test proves it's required (rejects when omitted) — guarding against a future weakening-to-optional. The value-level bind (a `policyVersion` equals some live policy's `version`) + write-access immutability are runtime (P5); the contract pins the structural half. (We chose NOT to extract a shared `PolicyVersion` symbol — it's a primitive string with no members to drift, unlike a closed union, lesson §5; revisit only if `version` gains a format constraint.)

**Rule:** Pin immutability-via-versioning structurally — the source carries a `version`, every produced artifact carries a REQUIRED `<thing>Version` of identical type (snapshot proves present + behavioral test proves required) — so the source is never mutated in place and each artifact is forever bound to + explainable against its exact version.

## <a id="13"></a>13. An authoritative-once-computed value is a REQUIRED persisted field + its provenance, so replay reads it and never recomputes

**Date:** 2026-06-20.
**Source slice:** contract track P0.8 (`837e5be`); `packages/contracts/src/scoring/novelty-score.ts`.

Rule #7 (replay calls no providers) is supported at the contract tier by making the expensive-once-computed value a **REQUIRED** persisted field plus the provenance needed to interpret it. `NoveltyScore.vector` (the embedding) is a required `array<number>`, and `embeddingModelId` + `dimension` are required too — so a `NoveltyScore` cannot validate without its persisted vector, and replay reads the stored vector rather than re-calling the embedding provider. The schema makes the optional-vector failure mode unrepresentable; the `length === dimension` relationship stays a kernel check (lesson §6). Generalizes to any persist-once value on the replay path (RNG outcomes, provider results, retrieval hits).

**Rule:** Make an authoritative-once-computed value (embeddings, RNG outcomes, provider/retrieval results) a REQUIRED field + its provenance in the contract, so it can't be omitted and the replay path reads it instead of recomputing (rule #7).

## <a id="14"></a>14. Format/lint/type checks must run the PACKAGE-PINNED binary — `npx prettier` can resolve a different version and report false-clean

**Date:** 2026-06-20.
**Source slice:** contract track contract-001 `/session-end` (`609cb9d`).

A per-slice Step-8 `npx prettier --check` resolved a DIFFERENT prettier than the workspace-pinned binary and reported **false-clean** on 10 files (Unicode in code comments shifted line-wrap past print-width); the authoritative `pnpm format:check` caught it only at `/session-end`, forcing a separate formatting-only commit (`609cb9d`). `npx <tool>` resolves the first match on `PATH` or fetches a "latest" — not necessarily the version pinned in the workspace — so version skew yields different rules: a check that passes locally while the pinned binary (CI / `/preflight`) fails. Always run the workspace-pinned binary: `pnpm format:check` / `pnpm lint` / `pnpm typecheck`, or `./node_modules/.bin/<tool>` — never bare `npx prettier`/`npx eslint`/`npx tsc`.

**Rule:** Run format/lint/type checks through the package-pinned binary (`pnpm <script>` or `./node_modules/.bin/<tool>`), never `npx <tool>` — `npx` can resolve a different version and report false-clean.

## <a id="15"></a>15. Per-type narrowing is a SEPARATE layer over the frozen envelope — a type→schema map + own-property resolver, fail-OPEN to generic, fail-CLOSED on a known-type mismatch

**Date:** 2026-06-20.
**Source slice:** contract track P0.10 (`73289fd`); `packages/contracts/src/events/payload-map.ts`.

`RunEventEnvelope.payload` is generic JSONB (`z.record(z.string(), z.unknown())`) at the envelope level; the six high-traffic event types (§4) need their payload narrowed to a frozen Appendix-A model so the SAME schema validates the event-store write and the model. The narrowing is built as a SEPARATE layer (`payload-map.ts`) — it never mutates the frozen P0.1 envelope. `HIGH_TRAFFIC_PAYLOAD_MAP: Partial<Record<RunEventType, ZodType>>` maps each high-traffic type to its model; `resolvePayloadSchema(type)` returns the narrowed schema for a high-traffic type and the generic schema otherwise.

The resolver fails two ways by design: fail-OPEN to the generic JSONB schema for any non-high-traffic type (an unknown/new type still validates as generic — the registry is the closure, not the resolver), and fail-CLOSED (reject) when a high-traffic type's payload doesn't match its narrowed model (a malformed high-traffic event can't slip through as generic). The lookup is own-property (`Object.prototype.hasOwnProperty.call`, lesson §11) so a crafted `type` like `__proto__`/`constructor` resolves to generic, never a borrowed schema off the prototype chain. The key-set + per-key mapping is snapshot-pinned so a high-traffic type can't be added/remapped silently. Downstream (the P1 append path) calls the composed `validateEventPayload(type, payload)` before append.

**Rule:** Narrow a generic envelope payload in a SEPARATE layer (type→schema map + own-property resolver), never by mutating the frozen envelope; fail OPEN to generic for unknown types, fail CLOSED on a known-type mismatch; snapshot the map.

## <a id="16"></a>16. A payload-DoS ceiling is a BOUNDED security primitive — depth-BEFORE-size (stringify recurses), iterative early-exit, true-byte count, result-object — not a Zod range

**Date:** 2026-06-20.
**Source slice:** contract track P0.10 (`73289fd`, follow-up `c33eb2f`); `packages/contracts/src/events/payload-map.ts`.

The envelope payload had no size/depth bound (P0.1 security review). `enforcePayloadCeiling(payload)` adds one as a pure result-object primitive (`{ok:true}` | `{ok:false, violation}`), NOT a Zod range refinement — a DoS bound is a security check the append path emits an event on, not a parse-time range (lesson §6: ranges that protect against a buggy producer are kernel rules; this is a security bound the contract owns and the append path calls).

Two non-obvious load-bearing properties: (1) it checks DEPTH BEFORE SIZE, because `JSON.stringify` itself recurses and would stack-overflow on a deeply-nested attacker payload BEFORE a size check could run — the depth check is an iterative explicit-stack walk that early-exits the instant depth exceeds the limit, never fully traversing pathological input. (2) the size check uses `Buffer.byteLength(s, 'utf8')` (true UTF-8 bytes), not `s.length` (UTF-16 code units, which under-counts multibyte/supplementary chars up to ~4× and makes the ceiling looser than its byte label). The whole thing is wrapped so an unserializable payload (BigInt, circular ref) becomes a violation, never a throw. Constants are literal-value-snapshot-pinned so a silent weakening of the bound is a test-breaking, reviewable change.

**Rule:** A payload-DoS ceiling is a bounded pure primitive (depth-before-size; iterative early-exit so deep input can't stack-overflow stringify; true-byte `Buffer.byteLength`; result-object never-throws; literal-pinned constants) that the append path calls — not a Zod range.

## <a id="17"></a>17. An agent-immutable anchor stacks ALL the immutability legs — closed-enum set + literal-true flag + required version + no-authority-field-via-strict + member/field snapshot

**Date:** 2026-06-20.
**Source slice:** contract track P0.15 FinalJudgeRubric (`5058400`); `packages/contracts/src/verifier/final-judge-rubric.ts`.

The held-out judge's rubric is the bedrock fitness anchor agents cannot move (safety rule #6). The contract pins immutability by SHAPE by stacking every leg at once — none alone is sufficient: a closed `z.enum` axis set (no agent can add/remove a judging axis, lesson §1), `immutableToAgents: z.literal(true)` (the flag can't be flipped or omitted), a REQUIRED `policyVersion` typed identically to `ScoringPolicy.version` (immutability-via-versioning, lesson §12 — never mutated in place), `z.strictObject` with no mutation/override/authority field representable (lesson §9), and a field-set + member-set + literal-value snapshot so any weakening is a cross-track regression (lesson §1).

The contract pins SHAPE only — completeness (the rubric carries the full axis set) and the no-agent-write-path are RUNTIME invariants (lesson §6) the P4/P5 held-out-judge LOAD path enforces (load from immutable config; assert the full axis set + `immutableToAgents:true` before scoring). The contract is defense-in-depth; the load path is the primary gate.

**Rule:** For a contract that must be immutable to agents, stack all the legs — closed-enum set + `literal(true)` flag + required identical-typed version + strict no-authority-field + value/member snapshot — and pin completeness + the no-write-path at the runtime load boundary.

## <a id="18"></a>18. A boundary validator returns the PARSED value, never the caller's input — else a transform/coercion silently bypasses on the authoritative path

**Date:** 2026-06-20.
**Source slice:** contract track P0.10 follow-up (`c33eb2f`); `packages/contracts/src/events/payload-map.ts`.

`validateEventPayload(type, payload)` originally returned `{ok:true, payload}` echoing the CALLER's input object rather than `parsed.data` from the `safeParse`. Functionally identical TODAY (no high-traffic schema uses `.transform`/`.coerce`/`.default`), but a latent data-integrity hole on the authoritative event log: the instant any schema gains a coercion, the P1 append path would persist the PRE-transform value — a TOCTOU between validate and use. A validator at a persistence boundary must return the validated/normalized output, so what was checked is exactly what flows downstream. (Surfaced as a phase-exit code-quality [medium]; fixed before the freeze closed.)

**Rule:** A boundary validator returns `parsed.data` (the validated/normalized value), never the caller's input — so a present-or-future transform/coercion can't bypass onto the authoritative path.
