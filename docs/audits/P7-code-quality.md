# P7 Code Quality Audit — `apps/web/` Phase 7 dashboard

**Scope:** Accumulated `apps/web/` branch diff (`main...HEAD`), `track/demo`. `apps/web/` did not exist at the fork, so this is an over-approximation (≈ all of `apps/web/src/**` + `apps/web/test/**` — acceptable at a phase boundary, per policy). Most recent delta: P7.3 sv5 status-map reconcile (`87e90d3` — `status-map.ts` gained `generation.degraded` + `candidate.repairing`). **Review surfaces:** correctness, edge cases, readability/naming, LESSONS §1–§10 consistency, dead code, test quality.

**Files reviewed:** 98 (all `apps/web/` files introduced on this branch).

---

## Findings

### [low] `apps/web/src/components/core/status-map.ts:99` — `generation.degraded` shares `var(--warning)` with `run.stopping` and `run.stopped` (cross-domain token collision, not a bug but a review note) · action: defer

`degraded` (amber `var(--warning)`, non-pulse) shares its colorToken with `run.stopping` (◐, amber, non-pulse) and `run.stopped` (■, amber, non-pulse). Within the `generation` domain the comment correctly notes this is distinct from the teal/blue pulsing phases and from `var(--danger)` `failed` — the glyphs do differ (◓ vs ◐ vs ■). However `run.stopping` is also ◐ and non-pulse with the same amber token, so an operator who sees generation-tier ◓ amber vs run-tier ◐ amber gets minimal visual distinction from color alone (the glyph is different, which is the redundant channel at work). This is a design-level note, not a rule #4 violation (glyph + label are both present and distinct). No action required unless the UX design review flags it.

### [low] `apps/web/src/components/core/status-map.ts:100` — `generation.verifying` reuses glyph `◐` that already appears in `agenome.active`, `candidate.under_review`, `run.completing`, `run.stopping` · action: defer

The `◐` glyph is used in five distinct (domain, status) slots across the map. Within each domain all glyphs are unique, and the label and color redundantly encode the meaning, so rule #4 is satisfied. Cross-domain `◐` proliferation is a visual vocabulary concern (projector legibility), not a correctness bug. No test covers cross-domain distinctness because the `StatusBadge` always renders with a domain, so two domains never collide at a single render site. Worth noting for a future a11y/projector linter subagent pass.

### [low] `apps/web/test/unit/components/status-map.test.ts:84–109` — the sv5-specific tests (`test_generation_degraded_mapped`, `test_candidate_repairing_mapped`, `test_new_specs_color_tokens_are_var_refs`) do not assert `pulse` presence/absence · action: defer

The new `repairing` spec carries `pulse: true` (correct: in-flight behavior) and `degraded` has no `pulse` (correct: NON-pulse is the deliberate semantic marker). The key semantic distinction — that `degraded` is intentionally NOT pulsing — is only documented in the inline comment; no test pins `spec.pulse === undefined` for `degraded` or `spec.pulse === true` for `repairing`. If a future edit accidentally adds `pulse: true` to `degraded` it would change the visual semantic (making an impaired-but-progressing state look "alive") without failing any test. The exhaustive token loop in `test_every_frozen_status_has_a_mapping` would not catch this because `pulse` is an optional field. Low-risk (the comment is clear and the map is small), but the invariant is worth pinning.

### [low] `apps/web/src/components/core/StatusBadge.tsx:30–33` — `SIZES` constant uses raw numeric px values for `glyph`/`label`/`gap` fields · action: defer

```ts
const SIZES = { sm: { glyph: 13, label: 11, gap: 6 }, ... }
```

These are numeric values that React renders as px. The comment on line 29 documents this: "numeric — projector floor 13; React renders these as px." The adherence test at `StatusBadge.test.tsx:43` greps for `\b\d+px\b` (a number followed by the literal string `px`) so it does NOT fire on the bare integer literals — the current test correctly passes. However LESSONS §3 says "no raw hex/px" and the comment concedes "projector floor 13; React renders these as px." The file-level doc string says "colors/spacing via tokens only (no raw hex/px)" which is slightly inconsistent with the SIZES constant (which uses raw integers that become px). This is the same design choice the prototype made for glyph sizes (unavoidable without adding a `--glyph-sm` CSS token set). It is a documentation inconsistency and was carried forward deliberately, as noted in the lesson. No action required unless the design token set is extended to cover glyph sizes.

### [low] `apps/web/src/components/core/StatusBadge.tsx:65` — pill branch renders only `spec.glyph` text with no separate text-label `<span>` (label lives only in `title`) · action: defer

The pill path renders `{spec.glyph}` inside the single `<span>` and puts the full label only in `title`. For the two subtype pills (`XFER`, `ZEIT`), the glyph IS the mnemonic text (not an icon), so the pill text functions as both shape and label — it is legible without `title`. The `title` attribute is still present for AT. This is a borderline rule #4 case; the design intent (documented in the prototype and inline comment: "text pill") is clear and the mnemonic serves double duty. No bug, but worth noting for the a11y subagent.

---

## sv5 spec sanity-check (primary focus)

**`generation.degraded`:**
- Glyph `◓` — unique within the `generation` domain (distinct from `△` failed, `●` running, `◐` verifying, `◑` scoring, `⚇` reproducing, `✔` complete, `–` skipped, `○` pending). Shape-distinct from all other generation entries.
- colorToken `var(--warning)` — defined in `colors.css:38` as amber `#f4b650`. Valid `var(--…)` reference. No raw hex.
- `pulse` absent — intentional (comment-documented: NON-pulse marks "impaired but progressing", set apart from teal/blue healthy pulsing phases). Semantically correct.
- No `glow` — correct (not a living/winner node).

**`candidate.repairing`:**
- Glyph `↻` — unique within the `candidate` domain (distinct from `·` created, `◐` under_review, `◑` checked, `◉` scored, `♔` selected, `✕` rejected/culled, `△` invalid).
- colorToken `var(--status-review)` — defined in `colors.css:54` as cyan `#3be3d0`, same as `under_review`. Intentional: the comment explains the repair is "in-flight-toned like under_review" (repair is not a failure, rule #8). Valid `var(--…)` reference. No raw hex.
- `pulse: true` — correct (active/in-flight, consistent with other in-flight entries).
- Glyph `↻` described as "text-presentation, shape-distinct from under_review's ◐" — confirmed distinct within domain.

**Color token definitions confirmed:** Both `var(--warning)` and `var(--status-review)` resolve to defined CSS custom properties in `apps/web/src/styles/tokens/colors.css` (lines 38 and 54 respectively). Both also have light-theme overrides (colors.css lines 143 and 158). No missing token definition.

**Toning consistency with existing families:**
- `repairing` (in-flight, pulse, cyan `--status-review`) is tonally consistent with `under_review` (in-flight, pulse, cyan `--status-review`). Correct family membership.
- `degraded` (non-pulse, amber `--warning`) uses the semantic feedback channel rather than a `--status-*` domain token. This is intentional (it's an impairment indicator, not a lifecycle stage color). Consistent with how `run.stopping` and `run.stopped` use `var(--warning)` for abnormal-but-not-failed states.

---

## Summary

- No correctness bugs found.
- No LESSONS §1–§10 violations found.
- No dead code found.
- No test-passes-for-wrong-reason issues found.
- The sv5 sv5 `generation.degraded` and `candidate.repairing` specs are correctly implemented: glyphs are domain-distinct, colorTokens are valid `var(--…)` references, pulse toning is consistent with in-flight (repairing) vs impaired-non-pulsing (degraded) families.
- Four low-severity observations noted (cross-domain token collision, ◐ proliferation, missing pulse-value pin in sv5 tests, SIZES px doc inconsistency), all deferred — none are correctness issues.

**Verdict: CLEAR**
