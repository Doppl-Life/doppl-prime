# Team Handoff — verifier track — P4 buildable-complete + merged to cody

- **Date:** 2026-06-22
- **Track:** `verifier` (worktree `../Capstone-verifier`, branch `track/verifier` @ `64bb325`)
- **Integration:** merged → `cody` @ **`069da90`** (pushed to origin/cody), preflight-green.
- **Team stood down** at this handoff (impl + orch were at context ACTION/WARN; re-spawn fresh for P4.7).

## State

**Verifier track is buildable-complete (10 of 11 P4 tasks) and integrated into cody.** Shipped this arc:
P4.3 rubric-load · P4.4 isolation seam · P4.5 allowlist registry · P4.6 critic council · P4.8 held-out
judge · P4.9/P4.10 check adapters (both subtypes 5/5) · grounding sub-bundle · P4.11 live-rerun ·
verifier-010 (P4.8 reconcile to the frozen P0.16 `JudgeResult`/`judge.reviewed` seam) · verifier-011
(P0.2 scrub numeric/boolean carve-out). Suite on merged cody: contracts 178 + apps/api 216 unit
(+ 38 integration in-worktree); lint/format/typecheck clean.

## The ONE remaining task — re-activation trigger

**P4.7 (critic-set rotation)** — the lone open P4 task. Gated on the kernel's persisted-RNG model.
**The user pulled forward kernel P3.6 for exactly this.** Re-activation trigger:

> **When kernel P3.6 lands in cody → user pings the lead → `/team-start verifier` → fresh orch+impl
> → one slice (P4.7 critic rotation against the real RNG substrate) → final verifier→cody merge → P4 complete.**

## Cross-track coordination (carry into the next verifier round + already routed to the human)

1. **Kernel:** `energy.spent`←`EnergyEvent` (`providerMeta?`) inherits the P0.2 scrub fix on merge.
   Kernel MUST `git merge cody` to pull the corrected scrub **before** building its ProviderMeta
   persistence; MUST NOT author a divergent fix. (User is notifying kernel directly; this is the durable record.)
2. **Selection P5.5:** fold the `JudgeResult` acceptance into the open `FitnessScore` component by
   `candidateId` join (named component, e.g. `judge_acceptance`), never a duplicate authoritative copy.
3. **Provenance:** the P0.2 scrub amendment was authored on the verifier track per the user's Option-B
   call (routed via the verifier→cody merge, not a re-opened contract track). The P0.16 contract reached
   the worktree via a contracts-only cherry-pick (`e664f68`↔`0f6c2ac`, content-identical to cody's copy).

## DEFERRED to the P4.7 re-activation merge (noted, not skipped)

- **LESSONS renumber + CLAUDE.md index:** cody's `apps/api/LESSONS.md` was resolved to cody's side at the
  merge (keeps §1–32: contract+kernel+P0.16). Verifier's 9 lessons (§27–§35 on track/verifier) are NOT yet
  appended to cody — they renumber to **§33–§41** (+6) and get appended at the P4.7 final merge (one renumber,
  not two). Verifier code comments referencing verifier-local §27–§35 are cosmetically ahead of cody's index
  until then. Lessons are safe on track/verifier @ `64bb325`.
- **IMPLEMENTATION_PLAN.md P4 checkbox ticks + ARCHITECTURE.md §7/§4 notes:** apply at the P4.7 final merge
  (the corrected routing: keep `judge.reviewed`←`JudgeResult`, drop the stale no-`judge.reviewed` note,
  narrow the correlationId-provenance note to P4.6).

## Pointers

- Session docs: `docs/sessions/verifier-001/002/003-*` (003 covers the reconcile + scrub fix).
- Briefs: `docs/briefs/verifier-001..011-*`.
- Merge commit: `069da90`. Verifier branch tip: `64bb325` (origin/track/verifier in-sync).
