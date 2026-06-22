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
**Source slice:** contract track P0.1 (`20ca1f3`); `packages/contracts`. **Refined:** kernel track P1.1 scaffold (`kernel-001`); `apps/api` — the second package to copy the pattern, which surfaced the sub-package deltas below.

The monorepo bootstrap pattern every later package (`apps/api`, `packages/observability`) copies: `pnpm-workspace.yaml` globs `packages/*` + `apps/*`; a root `tsconfig.base.json` carries the strict family (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`) and each package `tsconfig.json` extends it; each package owns its `lint`/`format:check`/`typecheck`/`test` scripts; the root `package.json` delegates via `pnpm -r --if-present` so `/preflight` runs identically from the repo root or a package dir (`--if-present` keeps a package lacking a given script from failing the recursion).

Gotcha (TypeScript 6): `baseUrl` is deprecated and **errors** under TS6 — `paths` now resolve **without** `baseUrl`. Configure `paths` directly and do not set `baseUrl`.

Gotcha (Prettier): `prettier --write .` from the repo root reflows EVERY file unless `.prettierignore` scopes it — in this slice it reflowed 63 repo-wide docs before recovery. `.prettierignore` must exclude `**/*.md`, `docs/`, `.claude/`, `.scaffolding/` so Prettier governs code only.

**Second-package deltas (kernel P1.1, `apps/api`).** Copying the shape to a package that (a) carries markdown docs and (b) imports a sibling package's *source* surfaced two refinements `packages/contracts` never hit (it has zero markdown and imports no cross-package source):

- **`format:check` must point at the root ignore.** Prettier resolves `.prettierignore` from the CWD, NOT ancestor dirs — so a bare `prettier --check .` run from `apps/api/` (which holds `CLAUDE.md` + `LESSONS.md`) ignores the root `.prettierignore` and flags those orchestrator-owned docs. A doc-carrying package's `format:check` script must pass `--ignore-path ../../.prettierignore`.
- **No `rootDir` when importing cross-package source via `paths`.** Setting `compilerOptions.rootDir` triggers TS6059 ("not under rootDir") on the sibling package's source pulled in by a `@scope/pkg` `paths` mapping. The base config is `noEmit`, so `rootDir` is cosmetic — omit it. (`packages/contracts` set `rootDir` safely only because it imports no cross-package source.)
- **No per-package ESLint config.** `eslint .` from a package dir discovers the root flat `eslint.config.mjs` — a local config is unnecessary.

**Rule:** New packages copy the P0.1 toolchain shape (workspace globs + strict `tsconfig.base` + per-package scripts + root `pnpm -r --if-present`); set `paths` without `baseUrl` (TS6) and omit `rootDir` when importing cross-package source; scope `.prettierignore` to code only and point a doc-carrying package's `format:check` at the root ignore via `--ignore-path ../../.prettierignore`; no per-package ESLint config (the root flat config resolves).

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

**Generalizes to any shared HELPER, not just contract unions (kernel track P3.1, `kernel-015`).** The same single-source rule applies to a shared pure UTILITY (`deepMerge`; the `summarizeZodIssues` path+code Zod-error formatter): the FIRST in-track consumer may mirror it locally (a cross-package frozen export isn't warranted for one consumer); the SECOND in-track consumer is the trigger to EXTRACT it to a shared in-track module (`apps/api/src/shared/*`) and RE-POINT the first consumer's mirror to it — one copy, no rule-of-two drift. Especially load-bearing for a SAFETY helper (the no-echo Zod summarizer, rule #4): two divergent copies risk one silently regaining the leak. A frozen-package private copy (contracts' own `deepMerge`) stays as-is — out-of-track to edit, and pure.

**Rule:** When a closed union/type — OR a shared pure util/helper — is needed by ≥2 in-track consumers, define it once in its own module, export from the barrel, and import everywhere; extract-and-re-point at the 2nd in-track consumer (never a 3rd mirror) — never redefine it per consumer.

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

## <a id="19"></a>19. Amending a frozen closed contract = a SOLO invariant slice (extend enum + schemaVersion bump + member-set snapshot + fixture re-record), spec authored first, BEFORE downstream forks

**Date:** 2026-06-21.
**Source slice:** contract track P0.1-amend (`dc493a3`); `packages/contracts/src/events/event-type.ts` + `src/version.ts`.

A frozen §2.5 contract sometimes needs amending after its freeze seal but before the dependent tracks fork — here `RunEventType` was missing the operation-start observability markers the architecture+plan required. Doing it BEFORE the fork is the cheap path: forking from a freeze the plan already contradicts guarantees a post-fork `schemaVersion` bump + a cross-track Finding to reconcile across every track that already forked.

The playbook: (1) the orchestrator authors the amendment SPEC into the worktree docs FIRST (`ARCHITECTURE.md` §-sections + Appendix-A row + `IMPLEMENTATION_PLAN.md` criterion/emit-bullets), from the authoritative source, so `spec-lint` + the schema-snapshot check against the right spec; (2) the implementer runs it as a SOLO invariant `/tdd` slice — extend the closed enum, bump `CURRENT_SCHEMA_VERSION`, update the member-set snapshot, re-record affected fixtures — preserving the contract's invariants (closure still rejects-unlisted, RISK-006; any safety semantic like rule-#8 no-energy-debit); (3) `security-reviewer` FAN OUT (a closed-union + safety semantics are invariant-touching); (4) re-run `/phase-exit` **delta-scoped** for an additive change (the prior full fan-out stands for the unchanged surface — verify the new members agree code↔snapshot↔doc) + re-seal. An additive enum + schemaVersion bump is **non-breaking** when readers accept `schemaVersion ≤ current` (old fixtures still validate) — a `feat`, not a `feat!`.

**2nd instance — the POST-fork amendment (kernel track P0.15-amend, `kernel-016`).** Before-fork is the cheap path, but an omission can surface AFTER the tracks fork (here: frozen `GenerationStatus` was missing `degraded` that §3 + P3.2 require — caught at P3.2 brief-authoring by diffing the frozen enum against §3, not at the freeze gate). The post-fork amendment is the SAME mechanical playbook (enum 8→9, `CURRENT_SCHEMA_VERSION` 2→3, snapshot, fixtures, security-reviewer, additive/backward-compat) with two deltas: (a) it needs a **user-ratified scoped exception** to the no-contract-edit guardrail (the active track owns the edit since the contract track is closed); and (b) cross-track propagation is **lead-sequenced** at the next track→integration merge (additive ⇒ non-urgent: other tracks pull + re-record their member-set snapshots; none break because old values stay valid). Backward-compat held identically — apps/api's `schemaVersion:2` fixtures stayed valid at v3 untouched (the ≤current ceiling is the reader's job). DX gap noted: `spec-lint` has no amendment mode (a ticked task structurally fails the "unticked checkbox" gate) — documented-override.

**3rd instance + the bump-vs-fold rule (kernel track P0.5-amend, `kernel-018`).** A SECOND omission of the same class surfaced right after the first (frozen `CandidateStatus` missing `repairing`, §3 lines 149-150/165 — caught at P3.2 Step-2.5, same diff-enum-vs-§3 method). When a same-class addition follows a PRIOR amendment, the mechanic question is **fold into the prior version vs a clean follow-up bump**: fold (no second bump) is viable ONLY while the prior bump's version is still UNRELEASED *and its fixtures aren't yet committed*; once the prior version is **committed with its fixtures** (here v3 = `a1da497`), a **clean follow-up bump (v3→v4) beats re-opening that committed version's fixtures** — even though both deltas still merge cross-track together in ONE propagation (the lead carried v3+v4 in a single kernel→cody merge). So the bump costs nothing extra in propagation and avoids touching settled fixtures. Net: two amendments, schemaVersion 2→4, `GenerationStatus`+`CandidateStatus` each 8→9 — the gap class (the §3 resolved-FIX-edge statuses the freeze omitted) then **CLOSED** (all 4 machines match §3). General learning: at a freeze gate, **diff every §3 state-machine status against its frozen enum** — that one check would have caught both omissions before the fork.

**Rule:** Amend a frozen contract as a SOLO invariant slice — author the spec into the docs first, then extend the closed enum + bump `schemaVersion` + update the member-set snapshot + re-record fixtures (closure + safety semantics preserved; additive = non-breaking); re-`/phase-exit` delta-scoped + re-seal. Prefer before-fork; a POST-fork amendment is the same playbook + a user-ratified scoped exception + lead-sequenced cross-track propagation at the next merge.

## <a id="20"></a>20. A subsystem seam = a TS interface over the frozen contracts, conformance-tested via `CANONICAL_FIXTURES` with a registry binding; first impl + first consumer deferred (explicit-deferral wiring)

**Date:** 2026-06-20.
**Source slice:** kernel track P2.1 (`kernel-002`; commit hash recorded at round close); `apps/api/src/model-gateway/port.ts` + `index.ts`.

The kernel CONSUMES the §2.5 contracts the contract track froze; this is the first consumer-side pattern (lessons §1–§19 are all authoring-side). A subsystem seam — the `ModelGateway` port here, the event-store writer / projection readers later — is defined consumer-side as a **TypeScript interface whose method I/O types ARE the frozen contracts** (imported from `@doppl/contracts`, never redefined — the consumer-side extension of lesson §5). The seam surface exposes **no vendor/infra type** — only the frozen Request/Response + capability — so domain importers depend on contracts alone (key safety rule #9, forbidden-pattern #2). The package barrel (`src/model-gateway/index.ts`) is the **one internal seam-import surface**; the backend-internal port stays OUT of the package's public barrel.

A type-only interface has no runtime behavior to unit-test, so conformance is pinned three ways at once: an **in-test minimal fake `implements` the port** (compile-time conformance — a drift between the port and the contract types fails `tsc`), PLUS runtime asserts that the fake's I/O `safeParse`s under the frozen Zod schemas, PLUS a **`CANONICAL_FIXTURES` registry binding** (`.toBe(canonicalValue(name))`, or `.toEqual` if the registry rebuilds the object). The registry binding is load-bearing and NOT optional: `safeParse` alone passes for ANY same-shaped object, so without the binding a drift between a named fixture and the P0.14 registry value would slip through. With it, a frozen-contract field change breaks the kernel's seam test loudly — the consumer-side half of the P0.14 consumer/producer agreement.

A seam defined ahead of its implementations has no production entry point yet — its Step-7.5 wiring is the **explicit-deferral form** ("`none — first impl in <slice>, first consumer in <slice>`"), and every deferred target must be a **named, real plan task** (never silently unreachable). For P2.1: first impl P2.9 (fake) / P2.5 (OpenRouter), first consumer P3 runtime, `ModelRoute` first consumed by P2.2.

**Rule:** Define a subsystem seam as a TS interface over the frozen contracts (I/O types imported, never redefined; no vendor/infra type in the surface — rule #9); conformance-test it with an in-test fake `implements` + `safeParse` + a `CANONICAL_FIXTURES` registry binding so a frozen-shape drift breaks loudly; wire via the explicit-deferral form with every first-impl/first-consumer named as a real task.

## <a id="21"></a>21. The env-value redaction layer is boundary-local and MUST cover object KEYS — the event payload is an open-key `z.record`, so producer-controlled keys reach the append path

**Date:** 2026-06-20.
**Source slice:** kernel track P1.2 (`kernel-003`; commit hash recorded at round close); `apps/api/src/event-store/redaction.ts`.

The frozen `scrubSecrets` (LESSONS 3) covers the key-format + key-name layers but is pure, so it cannot do the **env-value** layer — matching payload strings against the actual loaded `process.env` secret values. That layer is the SOLE defense for a non-format secret (a DB password matches no `sk-`/`Bearer` pattern and sits under no sensitive key-name). It lands at each persistence boundary (event-store before append — this slice; observability before Langfuse emit — P6.5), composing the frozen scrub + a local env-value pass over **injected** secret values (boot loads `process.env`; the function stays pure — LESSONS 4).

The trap (a [high] rule-#4 finding caught at Step 8): scoping the env-value pass to string VALUES + array elements only — on the premise that object keys are schema field names — LEAKS. `RunEventEnvelope.payload` is `z.record(z.string(), z.unknown())` and `GENERIC_PAYLOAD_SCHEMA` for the 30/36 non-high-traffic event types is the same open-key record, so **producer-controlled keys are on the real append path**, and a non-format secret used as a key survives verbatim into the authoritative log. The pass MUST redact secret values in keys too, **with de-collision** (the `[REDACTED]#2` suffix shape, implemented boundary-side since the frozen scrub is immutable) so two keys redacting alike don't collapse (the LESSONS-3 key-collision data-loss bug, not reintroduced).

Two more boundary-layer requirements: (a) an **empty/short secret-value guard** — filter blank + sub-threshold (≥8 chars) entries before matching, or a missing/blank env var turns every payload string into `[REDACTED]` (catastrophic over-redaction — `''.includes` matches everywhere); also drop any "secret" that is a substring of `REDACTION_PLACEHOLDER` (idempotency bulletproof). (b) **literal substring replacement** (`split`/`join`, never a built `RegExp`) so an arbitrary secret value carrying regex metacharacters can't ReDoS or mis-escape.

**Rule:** The env-value redaction layer is boundary-local (the pure frozen scrub can't host it): compose the frozen `scrubSecrets` + a local pass over INJECTED secret values that redacts values + array elements + **object keys (with de-collision)** — keys are producer-controlled because the event payload is an open-key `z.record`; guard empty/short secret values (≥8 + placeholder-substring) and match by literal substring replacement, never a built regex.

## <a id="22"></a>22. Verify the schema before narrowing a safety scrub's scope; aim the adversarial reviewer at exactly the boundary you narrowed

**Date:** 2026-06-20.
**Source slice:** kernel track P1.2 (`kernel-003`; commit hash recorded at round close).

At Step 2.5 the team proposed and the orchestrator blessed narrowing the env-value redaction to values-only, on an UNVERIFIED reachability premise ("payload keys are schema field names, so a secret-as-key is unreachable"). The premise was false — the payload is an open-key `z.record` (§21) — and a values-only scrub is a rule-#4 leak. Two disciplines each would have caught it: (a) **verify the reachability premise against the actual schema** before narrowing a safety primitive's scope (one read of `envelope.ts` / `payload-map.ts` shows the open-key record); (b) when you DO narrow, **point the Step-8 adversarial reviewer at exactly the narrowed boundary** — here the orchestrator's Step-2.5 reply explicitly told the `security-reviewer` to validate the values-only scope, and that directed pass reproduced the leak with evidence and overturned the call.

The posture: a scope-narrowing on a safety invariant (caps, redaction, allowlist, injection-isolation, the held-out judge) is the highest-risk kind of "optimization" — it removes defense. Treat the narrowing premise as a claim to verify against schema/code, not intuition, and aim the adversarial review at the exact thing you removed. Defer to verified evidence when it overturns the call (root `CLAUDE.md` phantom/evidence-deference).

**Rule:** Before narrowing a safety primitive's scope, verify the reachability premise against the actual schema/code; when you narrow, point the Step-8 adversarial reviewer at exactly that boundary; defer to verified counter-evidence.

## <a id="23"></a>23. The gateway structured-output discipline — validate → accept (parsed value) / repair ≤1 (output as `wrapUntrusted` DATA, never in the instruction) / reject (caller persists, gateway emits nothing)

**Date:** 2026-06-20.
**Source slice:** kernel track P2.4 (`kernel-004`; commit hash recorded at round close); `apps/api/src/model-gateway/structured-output.ts` + `gateway.ts`.

The gateway validates a model output against its request Zod schema and returns a frozen `ModelGatewayResponse` (`validationResult` ∈ `accepted|repaired|rejected`; `providerMeta` on every response; `rejection` iff rejected). On a schema failure it makes **exactly one** repair attempt — a structural single-`await` bound, NOT a counter or a loop, so "≤1" cannot drift. Accepted/repaired returns `parsed.data` (the validated/normalized value — lesson §18 — onto the authoritative path, never the raw output).

The rule-#5 isolation in the repair prompt is the load-bearing part: the invalid output is carried as DATA in a sentinel-wrapped **user** message via the FROZEN `wrapUntrusted` / `CRITIC_INPUT_SENTINEL` (lessons §5/§8 — reuse the single-source isolation primitive, do NOT invent a gateway-local sentinel), while the **system** message holds the repair instruction (schema + error) only. So untrusted model text never reaches an instruction string, and an output embedding the sentinel can't break out (`wrapUntrusted` neutralizes it — exactly-twice bound, §8). A still-invalid or non-repairable output (null/empty/transport-failure — nothing to repair) → `accepted=false` + `rejection`; the **caller** (not the gateway) persists `output_schema_rejected`, routing the raw output through the persistence-boundary scrub (P1.2). The gateway itself **emits/persists/debits nothing** — no event-store coupling, no energy accounting (rule #8 success-only debit is the kernel's job, P3.5), no vendor SDK (rule #9). The opaque `request.schema` (`z.unknown()`) is narrowed to a `ZodType` at the gateway boundary (an injected `resolveSchema`); a minimal `createGateway` shell composes the port + discipline around an injected `providerCall` + `capabilityFor` so the registry (P2.2) / real adapter (P2.5) / first consumer (P3) inject later.

**Rule:** The gateway structured-output discipline = validate against the request schema → accept (return `parsed.data`, §18) / repair ≤1 (invalid output as `wrapUntrusted` DATA in a user message, instruction in the system message only — rule #5; reuse the FROZEN sentinel §5/§8, never a local one) / reject (caller persists `output_schema_rejected` through the P1.2 scrub); ≤1 is a structural single-`await` bound; the gateway emits/persists/debits nothing.

## <a id="24"></a>24. Fake a seam by faking the PROVIDER layer fed into the REAL discipline — not by re-implementing the port; keep the fake stateless + deterministic

**Date:** 2026-06-21.
**Source slice:** kernel track P2.9 (`kernel-005`; commit hash recorded at round close); `apps/api/src/model-gateway/stub/`.

The deterministic fork artifact (the fake `ModelGateway` the verifier/selection/demo tracks run against) is built by injecting a fake `providerCall` + `capabilityFor` into the REAL `createGateway` — so the stub runs the genuine validate/repair/reject discipline (§23). A standalone port re-implementation would duplicate the discipline and silently drift from production; faking only the provider/IO layer means the fake CANNOT diverge from real behavior. Drive the accept/repair/reject paths via the fake provider's OUTPUT (a `mode: valid|repairable|reject` choosing schema-passing / first-invalid-then-valid / persistently-invalid raw output), never by bypassing the discipline.

Determinism is a hard requirement for a fork/replay artifact: two stub instances must be byte-identical for the same config + request. The trap is a cross-call counter ("first call invalid, second valid") — two instances with independent counters diverge. Instead detect the discipline's repair call STATELESSLY: the discipline's repair request carries the invalid output wrapped in the frozen `CRITIC_INPUT_SENTINEL` (§23 / rule #5), so the fake returns invalid when the sentinel is absent (initial call) and valid when present (repair call) — no state, fully deterministic. The fake reads no env (`selectGateway` takes a resolved `{useStub}`; the `defaults<file<env` resolution is the boot caller's via `validateRunConfig` — lesson §4).

**Rule:** Fake a seam by faking the provider/IO layer fed into the REAL discipline/orchestration (never re-implement the port — it drifts); drive valid/repairable/reject through the fake provider's output, not by bypassing the discipline; keep the fake stateless + deterministic (detect a repair call via the sentinel in the message, NOT a cross-call counter) and env-free (selection config is resolved by the boot caller).

## <a id="25"></a>25. DB append-only enforcement = a row-level (UPDATE/DELETE) trigger + a statement-level (TRUNCATE) trigger AND a least-privilege role — the trigger alone is privilege-defeatable

**Date:** 2026-06-21.
**Source slice:** kernel track P1.4 (`kernel-006`; commit hash recorded at round close); `apps/api/src/event-store/migrations/` + `migrate.ts`.

Rule #2's append-only guarantee for `run_events` is enforced at the DB, and making it COMPLETE took three things, not one:

- A **row-level `BEFORE UPDATE OR DELETE` trigger** that `RAISE`s (catches the obvious mutations; verified it also blocks upsert / CTE-delete / join-update bypasses).
- A **statement-level `BEFORE TRUNCATE` trigger** — a row-level trigger CANNOT catch `TRUNCATE`, which would silently wipe the whole log. (Found at Step 8; closed in-slice — never ship a known append-only gap.)
- A **least-privilege DB role**: triggers are privilege-dependent — a **superuser OR the table owner** defeats them on its own connection (`SET session_replication_role='replica'` or `ALTER TABLE … DISABLE TRIGGER ALL`, both verified on the container). So the runtime MUST connect as a non-owner/non-superuser app role, with migrations run as a separate owner/admin role. The trigger is necessary but NOT sufficient without the role split. ([high] finding at P1.4 Step 8 → folded into P3 + a §9/§14 arch note; not fixable in the migration slice — there's no runtime connection/role layer yet.)

**testcontainers harness** (the kernel's real-PG integration pattern): integration tests run against a real Dockerized Postgres (no mocks on the load-bearing path, §16) via a **shared container booted once in a Vitest `globalSetup`** (migrate once, share the URI through `provide`/`inject`); the Vitest config is **split** — unit-only default so `pnpm test`/`test:unit`/`/preflight` stay fast + Docker-free, plus a separate integration config for the container suite (`test:integration`). Drizzle-generated migration artifacts go in `.prettierignore`. Op note: a wedged Docker engine (persistent 500 on `/_ping`) is HOST-side — only a Docker Desktop restart clears it; don't burn cycles on CLI daemon-recovery.

**Rule:** Enforce append-only at the DB with BOTH a row-level UPDATE/DELETE trigger AND a statement-level TRUNCATE trigger, AND a least-privilege runtime role (non-owner/non-superuser; migrations as a separate owner) — the trigger alone is privilege-defeatable. Integration-test against a real PG via a shared testcontainers container (`globalSetup`), with the Vitest config split so `/preflight` stays Docker-free.

## <a id="26"></a>26. The authoritative append path is ONE transaction (validate → ceiling → scrub-on-parsed → advisory-lock sequence → insert); the writer exposes only append + ordered-read; error messages never echo payload

**Date:** 2026-06-21.
**Source slice:** kernel track P1.3 (`kernel-007`; commit hash recorded at round close); `apps/api/src/event-store/{append.ts, sequence.ts, index.ts}`.

The sole authoritative write to `run_events` is ONE transaction, in this order: (1) **validate** the envelope against `RunEventEnvelope.omit({sequence, occurredAt})` — both are server/DB-assigned, so the caller can't supply them (safe-by-construction: a caller can't set the ordering key OR the log clock); (2) **`validateEventPayload`** (per-type narrow + size/depth ceiling) — on `{ok:false}` the writer **REJECTS** with a typed `AppendError{reason}` and the CALLER (the kernel) emits the violation event (the writer stays a pure mechanism — append/read only, never event semantics); (3) **`scrubSecrets` on the PARSED payload** (lesson §18 — scrub what you persist, the validated value) BEFORE the insert (rule #4 — the only insert site, so no payload reaches disk unscrubbed); (4) **allocate** a per-run monotonic gapless sequence; (5) **insert**.

Sequence allocation under concurrency: `pg_advisory_xact_lock(hashtext(run_id))` at the top of the txn + `COALESCE(MAX(sequence)+1, 0)` — the lock serializes same-run appends (released at commit) and different `run_id`s hash to different locks so cross-run appends don't contend. This closes the READ COMMITTED TOCTOU between `MAX(sequence)` and the insert (verified: 100 concurrent appends across two independent pools → `0..99`, no dup/gap/deadlock); the `unique(run_id, sequence)` constraint (P1.4) is the backstop. The writer's surface is exactly `{append, readByRun}` — no update/delete path; ids are opaque parameterized columns everywhere (incl. the raw `sql` in the allocator). `secretValues` is injected (IO at the boundary, §4).

**Forward-guard (rule #4) — HARDENED in kernel-014 (P1.8-followup).** The `schema_invalid` `AppendError` now emits Zod issue **`path` + `code` only** (via the pure exported `summarizeValidationIssues`), never `.message` / `.received` / the offending key — so no caller-controlled value reaches an authoritative-path error the scrub doesn't cover. The genuine Zod-4 echo vector is **`unrecognized_keys`** (Zod echoes the offending KEY — caller-controlled, can be secret-shaped — in `.message`, NOT an invalid enum VALUE, which yields only the allowed-set "expected one of …"). It is currently neutralized at the envelope boundary ONLY because `RunEventEnvelope.payload` is `z.record(z.string(), z.unknown())` (open values never fail → no caller key surfaces in a Zod path). **Flag:** if a future amendment narrows a record field's VALUE schema on the authoritative envelope, `summarizeValidationIssues` keeps it safe (path+code), but any NEW error path that interpolates a Zod `.message`/`.keys` would re-open the vector — keep payload/keys out of authoritative-path error messages.

**Rule:** The authoritative append is one txn — validate (omit the server/DB-assigned `sequence`+`occurredAt`) → ceiling (reject `{ok:false}`, caller emits the event) → scrub the parsed payload → advisory-lock-serialized sequence (`pg_advisory_xact_lock(hashtext(run_id))` + `COALESCE(MAX+1,0)`) → insert; the writer exposes only append + ordered-read; ids parameterized; authoritative-path error messages never echo payload content.

## <a id="27"></a>27. The credential boundary at config — provider keys are env-only, fail-fast-checked at boot, and STRUCTURALLY unrepresentable in the config object

**Date:** 2026-06-21.
**Source slice:** kernel track P2.2 (`kernel-008`; commit hash recorded at round close); `apps/api/src/model-gateway/{config.schema.ts, registry.ts}` + `apps/api/src/config/model-registry.config.ts`.

A config object carrying provider routing (the model registry) must never become a credential-leak vector if logged or persisted. Three legs make the boundary hold (rule #4):

- **Structurally unrepresentable:** the config schema is strict (`RouteConfig`/`RegistryConfig` = `z.strictObject`), so a credential field (`apiKey`/`token`/…) is REJECTED at validation — at the top level, nested on a route, AND in the file/env override layers. The config carries only provider/modelId/capability/fallback. This is lesson §9's "no-X-field-via-shape" applied to credentials: the leak is unrepresentable, not merely absent.
- **env-only + fail-fast:** `assertProviderCredentials(env)` reads ONLY injected env (the boot layer passes `process.env` — lesson §4), checks the required set at boot, and aborts with a clear error on a missing/blank var. Credentials are passed to adapters at call time, never stored in the config object.
- **No value-echo in errors:** the fail-fast error NAMES the missing var, never its value; Zod's "Unrecognized key" names the rejected key, not the value — so even the error path can't leak (cf. §26's forward-guard).

The `defaults < file < env` merge is the lesson-§4 discipline (deep-merge objects / replace arrays+scalars / skip `__proto__`/`constructor`/`prototype` / field-identifying errors); contracts' `deepMerge` is private, so it's mirrored locally with §4 cited (single-source via a cross-track export only once a 2nd+ in-track consumer — e.g. P3.1's boot-config — appears).

**Rule:** A config object carrying provider routing keeps credentials env-only + fail-fast-checked at boot + STRUCTURALLY unrepresentable in the config (strict schema rejects a cred field at every layer — §9 applied to creds); errors name vars/keys, never values; merge `defaults<file<env` via the §4 discipline.

## <a id="28"></a>28. The provider-adapter pattern — SDK behind one client factory, a reusable no-throw retry policy, and a terminal `ProviderCallError` the GATEWAY maps to rejected

**Date:** 2026-06-21.
**Source slice:** kernel track P2.5 (`kernel-009`; commit hash recorded at round close); `apps/api/src/model-gateway/adapters/{openrouter.adapter.ts, retry.ts}` + `gateway.ts`.

A provider adapter (the thing that actually calls a vendor) follows one shape, reused by every adapter (OpenRouter generation; OpenAI embeddings P2.6; retrieval P2.7):

- **SDK behind ONE client factory:** the vendor SDK is imported in a single client factory; NO vendor type appears in the adapter's exported surface (rule #9 — domain/runtime see only contract types; grep-pinned). Credentials load only from env inside that factory (rule #4).
- **A reusable `retry.ts` (`withRetry`):** bounded retries (default 2) + a per-role timeout (**injected adapter config** — the frozen `ModelRoute` has NO timeout field) + one fallback-route attempt, returning a DISCRIMINATED outcome. It NEVER throws on a provider failure; each failed attempt yields `provider_call_failed{attempt,reason}`. It does NO energy accounting (rule #8 — energy is the kernel's success-only concern, P3.5); a successful call returns `providerMeta` (actual provider/modelId/gatewayRequestId + tokens) for the kernel to reconcile.
- **The no-throw envelope is the WHOLE adapter, not just the happy path:** a [medium] caught at Step 8 was eager fallback-ROUTE resolution throwing a raw `Error` OUTSIDE `withRetry` — anything that can fail (incl. resolving the fallback route) must be inside the bounded no-throw envelope, or it escapes as a raw throw.
- **Terminal failure = throw `ProviderCallError`**, which the GATEWAY (`createGateway`, the port impl) maps to `accepted:false`/rejected (+providerMeta) — so domain code NEVER sees a throw (§6 port contract, lesson §20). The mapping lives ONCE in the gateway (DRY across all adapters), not per-adapter.
- The adapter returns the **RAW output**; validation/repair/reject is the gateway discipline's job (§23), not the adapter's.

**Rule:** A provider adapter imports the SDK in one client factory (no vendor type in its surface — rule #9; creds env-only — rule #4), runs a reusable bounded-retry/per-role-timeout/one-fallback policy that NEVER throws on a provider failure (everything fallible — incl. fallback-route resolution — inside the envelope) + does no energy accounting (rule #8), throws a terminal `ProviderCallError` the GATEWAY maps to a rejected response (§6/§20 — domain never sees a throw), and returns the raw output for the §23 discipline to validate.

## <a id="29"></a>29. The demo-safety fallback adapter — a rehearsed-fallback capability falls back, never rejects (diverges from §28's throw→reject leg)

**Date:** 2026-06-21.
**Source slice:** kernel track P2.7 (`kernel-011`; commit hash recorded at round close); `apps/api/src/model-gateway/adapters/{retrieval.adapter.ts, curated-corpus.ts}` + `apps/api/src/config/prior-art-corpus.config.ts`.

The §28 adapter pattern ends a terminal provider failure by throwing `ProviderCallError`, which the gateway maps to a rejected response. A capability with a REHEARSED FALLBACK — retrieval/web-search, whose operator-curated static prior-art/signals corpus is the demo-safety net (§6 RISK-004/005) — inverts that last leg while keeping every other §28 invariant:

- **Falls back, never rejects.** When the live provider is absent (no client injected) OR its bounded `withRetry` attempts terminally fail (incl. rate-limit/timeout), the adapter returns the curated-corpus result tagged `fallbackSourced:true` — it does NOT throw `ProviderCallError`, so the gateway's no-schema path returns an ACCEPTED response and **no gateway change is needed**. An empty curated match returns `results:[]` (still `fallbackSourced:true`): "no grounding found" is valid data, not a call failure.
- **Failures still surface; energy stays success-only (rule #8).** The failed live attempts ride `output.failures` (`AttemptFailure[]`) for the caller's `provider_call_failed` events (even on a live success after transient retries); the fallback `providerMeta` carries zero tokens + no `costEstimate`, so the kernel debits nothing. The live-success path carries the web-search tool-call cost in `providerMeta.costEstimate` for success-only accounting.
- **The fallback shape is replay-self-sufficient (rule #7).** Results are returned in a self-contained, persist-into-the-originating-event shape; a pure `retrievalEvidenceRef(item, eventId, kind)` builds a frozen `EvidenceRef` (P0.5) anchored by a MANDATORY non-empty `eventId` (Postgres-resolvable, never external-only — a kernel rule layered over the permissive frozen schema, lesson 6) with kind ∈ {prior_art, signal}. Once the caller persists the result, replay reads it and never re-calls the web.
- **Still vendor-free + pluggable (rule #9).** The live-search client is OUR seam interface (no vendor SDK imported — the concrete provider is deferred to the §6 spike); the curated lookup is pure (no IO/clock/random, fixed-regex tokenizer — no ReDoS) and replay-safe; `assertProviderCredentials` is unchanged because the curated fallback needs no creds (the live key loads lazily in the live-client factory if/when a provider is wired).

**Rule:** A capability with a rehearsed fallback (a curated demo-safety corpus) FALLS BACK on terminal failure (tagged `fallbackSourced`; empty result valid) and NEVER rejects — diverging from §28's throw→reject leg — while keeping the §28 invariants (bounded `withRetry`, failures surfaced, no energy on failure, vendor-free seam) and returning a replay-self-sufficient, `EvidenceRef`-anchored-by-`eventId` shape (rule #7).

## <a id="30"></a>30. Replay-safety by construction — a replay-path/authoritative-read component is PURE with no external seam, so rule #7 holds by absence-of-capability, not a runtime guard

**Date:** 2026-06-21.
**Source slice:** kernel track P1.7 (`kernel-012`; commit hash recorded at round close); `apps/api/src/event-store/evidence-resolver.ts`.

Rule #7 — replay (and any authoritative read) calls no model/embedding/web provider — is held most strongly NOT by a runtime guard (`if (replaying) throw`) or a test alone, but by giving the component NO seam to violate it:

- The pure resolver core (`resolveEvidenceRef(ref, events)`) is **`import type`-only** — no fetch/IO/network/clock/random dependency in scope — so an external dereference is **structurally impossible**, not merely unused. An `EvidenceRef` pointing only outside the Postgres tier (an external `uri` OR a `langfuseObservationId` — Langfuse is the §6/§13 NON-authoritative side channel) resolves to a fail-closed `external_only` result; the resolver *cannot* fetch it because it holds nothing to fetch with. `eventId`-first precedence (the authoritative Postgres pointer wins over external provenance); a pointerless ref → `no_pointer`.
- This is the rule-#7 analogue of the no-X-field-via-shape technique (lessons §9/§11): make the violation **uncallable**, not guarded. A reviewer verifies the property by reading the **import list** (no IO seam), not by tracing branches.
- Confine unavoidable IO to the already-injected dependency: the async convenience `createEvidenceResolver(store)` does its only read via the store's `readByRun`, deduped per-run with a Map cache that **evicts on a rejected read** (a cached rejected promise would make a transient read failure permanent — a [low] caught at Step 8; concurrency-dedup preserved, transient read stays retryable).

Applies forward to **P1.8** (the replay reader reconstructs from persisted seed/outcomes with no provider seam) and the projection builders — each consumer creates a fresh resolver per pass (the cache is read-once-per-run).

**Rule:** Enforce rule #7 BY CONSTRUCTION — keep a replay-path/authoritative-read component pure with no model/web/IO seam in scope (verify by the import list), so an external call is impossible rather than runtime-guarded; fail closed on any non-Postgres pointer (external `uri` OR non-authoritative `langfuseObservationId` → `external_only`); confine unavoidable IO to the injected store + evict cached rejections.

## <a id="31"></a>31. Reading an authoritative ordered log — VALIDATE-not-sort, and a canonical-equivalence serializer MUST mirror `JSON.stringify`'s `toJSON` (or Date/custom values silently false-collapse)

**Date:** 2026-06-21.
**Source slice:** kernel track P1.8 (`kernel-013`; commit hash recorded at round close); `apps/api/src/event-store/{replay-reader.ts, canonical-serialization.ts}`.

Two principles from the replay reader (the demo's rule-#7 safety net), both about NOT silently producing a wrong result:

- **Validate, never re-sort, an authoritative ordered log.** The reader asserts the stored `sequence` is strictly-increasing + contiguous-from-0 and throws `ReplayIntegrityError{ reason: 'gap' | 'out_of_order' | 'schema_too_new' }` on any violation (out_of_order checked in a full pass BEFORE the gap pass, so a decrease like `0,2,1` classifies as `out_of_order`, not `gap`). Silently re-sorting or skipping would MASK a corrupted authoritative log and yield a silently-wrong projection — the one thing replay must never do. For SHAPE, trust the write-time boundary: a stored row was `RunEventEnvelope`-validated at append (rule #2 append-only + P1.4 least-privilege make it trustworthy by construction), so the reader re-checks only the READ-time invariants — ordering + `schemaVersion ≤ CURRENT_SCHEMA_VERSION` — and folds `RunEventRow` directly (no envelope re-parse; post-insert DB-tamper is P1.4's threat model, not replay's — so no 4th `malformed` reason).
- **A canonical-equivalence serializer must mirror `JSON.stringify`'s `toJSON`.** State-equivalence (`canonicalSerialize(rebuilt) === canonicalSerialize(captured)`) compares states serialized with recursively-sorted keys. A naive recursive sorter treats a `Date` as a plain object → `Object.keys(date) === []` → every instant collapses to `{}` → **silent false-equivalence** (caught as a [medium]; `RunEventRow.occurredAt` is a `Date`, so a timestamp fold would trip it). Fix: honor `toJSON` exactly like `JSON.stringify` (Date → ISO) BEFORE key-sorting — **applied ONCE per slot** (split a `canonicalizeStructure` helper the toJSON branch delegates to; members recurse via `canonicalize`, each its own slot), NOT recursively on the `toJSON` result itself (else a `toJSON` returning a `toJSON`-bearing object calls `toJSON` twice — divergence caught at the P1 phase-exit gate, fixed in kernel-014). The canonical tree must also be **pure data**: `canonicalizeStructure` DROPS function/`undefined` object values (array elements → `null`), exactly like `JSON.stringify` omission — otherwise a `toJSON`-result object carrying its own `toJSON` *function* property survives into the tree and the FINAL `JSON.stringify` re-invokes it. The fold-state contract is therefore JSON-safe values + `toJSON`-normalized; a non-JSON-safe fold value (BigInt/circular) throws LOUD, never serializes to a silently-wrong form.

**Rule:** When reading an authoritative ordered log, VALIDATE-not-sort (throw on gap/out-of-order/too-new; never silently re-sort or skip) and trust the write-time boundary for shape (re-check only ordering + `schemaVersion`, no re-parse); a canonical serializer used for equivalence MUST mirror `JSON.stringify`'s `toJSON` (Date→ISO) or custom-`toJSON` values silently false-collapse — keep fold states JSON-safe + fail loud on non-serializable values.

## <a id="32"></a>32. The boot-config loader — ONE `loadConfig` composes the canonical validators into a single deep-frozen `AppConfig`; credentials are disjoint from a CLOSED env→config allowlist

**Date:** 2026-06-21.
**Source slice:** kernel track P3.1 (`kernel-015`; commit hash recorded at round close); `apps/api/src/runtime/config/{loadConfig.ts, configSchema.ts, envSchema.ts}`.

Boot config is loaded through ONE entry point that COMPOSES the already-canonical validators rather than reinventing parsing — `loadConfig({env, fileSources})` calls `validateRunConfig` (P0.3), `loadModelRegistry` + `assertProviderCredentials` (P2.2), and the new per-source Zod schemas (scoring-policy / caps-defaults / problem-sets), and returns a single validated `AppConfig` the kernel consumes. Precedence is `defaults < file < env` via the single-sourced `deepMerge` (§5). Fail-fast: any schema violation aborts boot with a field-pointing `path`+`code` error (the shared `summarizeZodIssues`, §26), never a partial/degraded start.

The load-bearing security shape is the **two disjoint env paths** (rule #4): the flat `env` (`process.env`) feeds (a) **credentials** → `assertProviderCredentials(env)` ONLY, never merged into any config object; and (b) **config overrides** → a CLOSED, explicit, per-key **allowlist** (`DOPPL_MAX_POPULATION`→caps, `DOPPL_RNG_SEED`→runConfig, …) projected with typed coercion — **never** an `Object.entries(env)` / `DOPPL_*` prefix sweep. The closed allowlist is what makes the boundary airtight: a secret-shaped non-allowlisted var (a future `DOPPL_SECRET_…`) is structurally un-projectable, so it can't leak into a persisted/logged config. The returned `AppConfig` carries NO credential field by shape, and is **deep-frozen** (nested objects + arrays) AND `readonly`-typed (defense-in-depth) so downstream kernel code can't mutate boot config. Pin the closed-allowlist invariant with a test that a non-allowlisted (secret-shaped) env key is NOT projected — not just that named creds are absent.

Open edge: delegated validators that still echo `issue.message` (`validateRunConfig`, `loadModelRegistry`) are safe ONLY because credentials structurally can't reach them and their file sources are operator-controlled (same trust tier) — a future tidy could re-point them to `summarizeZodIssues`; don't route a less-trusted source through them without that.

**Rule:** Load boot config through ONE `loadConfig` that composes the canonical validators (`validateRunConfig`/`loadModelRegistry`/`assertProviderCredentials`) into a single deep-frozen + `readonly` `AppConfig`; resolve `defaults<file<env` via the shared `deepMerge`; keep credentials env-only and DISJOINT from a CLOSED explicit env→config allowlist (no prefix sweep — a non-allowlisted secret-shaped var is un-projectable); fail-fast with `path`+`code` errors (no value echo).

## <a id="33"></a>33. State-machine guards — a PURE `(from,to)→decision` over a per-machine transition table (the table IS the spec), terminal-checked-first; semantic preconditions stay in the kernel, not the guard

**Date:** 2026-06-21.
**Source slice:** kernel track P3.2 (`kernel-017`; commit hash recorded at round close); `apps/api/src/runtime/state/{transitionGuard.ts, runStateMachine.ts, generationStateMachine.ts, agenomeStateMachine.ts}`.

The kernel's lifecycle state machines are enforced as **pure transition guards**, not embedded in the loop: `canTransition*(from, to) → {allowed:true} | {allowed:false, reason, from, to}`. Each machine is a per-machine **transition table** (`Record<Status, readonly Status[]>` + a `ReadonlySet` of terminals) that IS the §3 spec — readable, diffable edge-by-edge against the architecture — fed to ONE shared `makeTransitionGuard(table, terminals)` builder (§5 single-source: the lookup/terminal logic exists once; each table is the only per-machine surface). The guard **decides only** — no event emit, no state mutation, no IO (the loop emits, the appender persists; lesson §26). Same `(from,to)` → same decision.

Three structural pins make it safe:
- **Terminal-checked FIRST:** the guard rejects any transition FROM a terminal state (`reason:'from_terminal'`) before the table lookup — so a terminal can never yield `allowed:true` even if a target were mis-listed. Distinct from `illegal_transition` (a non-terminal disallowed pair) so the kernel can treat a from-terminal attempt as the likely-bug it is.
- **Full `Record<Status,…>` tables** (every enum member keyed) → a future enum member added without a table entry is a **compile error**, not a silent gap (the type system enforces table completeness against the frozen union).
- **Edge-exact vs the spec:** the security pin is "no EXTRA edge" (the critical failure mode is persisting an illegal lifecycle state) AND "no missing edge" — a byte-level diff of each table vs §3.

The boundary that keeps the guard pure: **semantic preconditions stay in the kernel (§6), not the guard.** A precondition that depends on run state beyond `(from,to)` — e.g. agenome `eligible_parent` is reachable only after a candidate hit a fitness score — can't be a pure `(from,to)` decision, so the guard allows the transition SHAPE (`spent→eligible_parent`) and the kernel/loop (P3.10) enforces the precondition. Safety-relevant transition closures (no `spent|failed|culled→active` re-entry — the only energy-spending status reachable only via `seeded→active`) ARE in the table (they're pure (from,to) facts). The denial `reason` carries only enum status strings — never payload.

**Rule:** Model a kernel state machine as a pure `(from,to)→decision` guard over a per-machine transition table (the table IS the spec; full `Record<Status,…>` so a new member fails compile) via a shared builder; check terminal-FIRST (`from_terminal` ≠ `illegal_transition`); the guard decides only (no emit/mutate/IO); keep semantic preconditions (run-state-dependent gates) in the kernel/loop per §6, and pure transition-closure safety facts (no energy-state re-entry) in the table.

## <a id="34"></a>34. A cross-subsystem ACCEPTANCE OUTPUT is a first-class persisted model (modeled on its authoritative sibling) — and a closed-set breakdown is keyed by `z.record(ClosedEnum, …)`, not duplicated literals

**Date:** 2026-06-21.
**Source slice:** contract track P0.16 (judge-output amendment, 2nd freeze amendment); `packages/contracts/src/verifier/judge-result.ts` + `src/events/{event-type,payload-map}.ts`.

The held-out judge's INPUT was frozen (FinalJudgeRubric, the `final_judge` role, the `judge.review_started` marker) but its ACCEPTANCE OUTPUT had no model and no terminal event type — P4.8 said "persist the judge event" and P5.5 said "read the persisted judge event," yet nothing was defined to persist or read. A seam that only one side names is a latent blocker; the selection track surfaced it. The fix: a first-class persisted model + a terminal event type, modeled on its authoritative SIBLING — `JudgeResult` mirrors `NoveltyScore` (id + candidateId + the authoritative-once-computed payload + provenance + the version tie), and `judge.reviewed`←`JudgeResult` mirrors `novelty.scored`←`NoveltyScore`. The downstream consumer (fitness) links by `candidateId` join + a named `components.judge_acceptance` signal — NOT a duplicate authoritative copy and NOT a dedicated id field (`judgeResultId` strict-rejected, exactly as `noveltyScoreId` is) — so the new model stays the single authoritative home.

The per-axis breakdown is keyed by `z.record(FinalJudgeAxis, z.number())`, deriving the 5-axis set from the single-source closed enum (lesson §5) instead of re-listing the names in a `strictObject`. In **Zod v4** an enum-keyed record is EXHAUSTIVE + CLOSED (all members required, an unknown key rejected) — verified empirically against the pinned version — so this one line pins both completeness AND closure of the judging axes at the persist boundary (rule #6 anti-reward-hacking defense-in-depth + rule #5 reject-malformed). The cost: this is **Zod-v4-version-dependent behavior** (not true in v3), and a `z.record` has no `.shape`, so the inner key-set isn't introspected by the `objectFieldNames` snapshot harness — pin its exhaustiveness/closure with behavioral tests (all-required, reject-unknown-axis) and gate a Zod major bump as a safety-relevant change that must re-run the contract tests. The 0-5 axis scale + acceptance range stay permissive `z.number()` (range = runtime/scoring concern, lesson §6, like `NoveltyScore.score`).

**Rule:** Model a cross-subsystem acceptance/measurement OUTPUT as a first-class persisted contract shaped like its authoritative sibling (don't leave it as a producer-only "persist it" bullet); link the downstream consumer by join + named component, never a duplicate copy or dedicated id; key a closed-set breakdown with `z.record(ClosedEnum, …)` to derive the set from one source + pin completeness/closure (Zod-v4-dependent — gate a major bump), keeping numeric ranges as runtime concerns.

_(P0.16; renumbered §32→§34 at the kernel↔cody reconciliation — its original §32 collided with the kernel's boot-config §32.)_
