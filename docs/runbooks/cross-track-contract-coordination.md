# Cross-track contract coordination — announce-before-merge

> **Status:** ACTIVE (user-adopted 2026-06-22). Applies to all parallel tracks (contract · kernel · verifier · selection · demo) merging into the integration branch (`cody`).

## Why

`packages/contracts` is a **shared, frozen surface** every track depends on. In the first weeks of parallel work, three contract-surface changes landed through different tracks in a short window and collided:

1. **P0.16 judge seam** (`JudgeResult` + `judge.reviewed`) bumped `CURRENT_SCHEMA_VERSION` 2→3.
2. The **kernel's status amendments** (`degraded`, `repairing`) *also* claimed v3→v4 off the same v2 base — because the kernel forked before P0.16 and never saw it. → a **schemaVersion collision** that required a reconciliation slice (kernel-020) + caused a mid-merge stall.
3. The **verifier's P0.2 scrub fix** (numeric `ProviderMeta` corruption) landed via verifier→cody — caught only by a proactive cross-track message + pre-merge verification.

All three were caught, but by diligence, not by process. A less careful merge could have **silently corrupted the authoritative event log** (rules #2/#4/#7). Root cause: parallel tracks bumping the shared monotonic `CURRENT_SCHEMA_VERSION` (and re-recording shared snapshots) with no visibility into each other.

## The rule

**Before a track lands any frozen-contract-surface change** — a `CURRENT_SCHEMA_VERSION` bump, a closed-enum member, an Appendix-A model edit, or a `scrubSecrets`/redaction change:

1. **Announce it** to the other track leads (via the cross-track conduit) *before* merging it to `cody` — name the change + the new schemaVersion.
2. **Land it on `cody` before dependent tracks build against it** (owner → integration → consumers; the team-protocol §3 propagation order).

**Before any track→cody merge** (the merging lead):

3. **Verify `cody`'s current contract state** — `CURRENT_SCHEMA_VERSION`, the affected enums/snapshots, and whether another track has a contract change in flight. (`git fetch` + read `packages/contracts/src/version.ts` + the relevant snapshot.)
4. **Dry-run the merge** (`git merge --no-commit --no-ff <track>` → inspect `--diff-filter=U` → `git merge --abort`). A clean *git* merge is necessary but **not sufficient** — run the full integration preflight (contracts + apps/api, incl. integration tests) before pushing, because two tracks re-recording disjoint snapshots merge clean yet can still leave a latent inconsistency.
5. **One actor merges at a time** — never race two track→cody merges. If `origin/cody` moved since your fetch, re-fetch + re-reconcile.

## schemaVersion linearization (when a collision already happened)

If two tracks claimed the same version for disjoint changes: keep the version that **already reached the integration branch** as-is, and **re-number the not-yet-merged track's change to sit above it** (e.g. judge=v3 stayed; degraded+repairing folded to v4). Union all changes; re-record the member-set snapshots + fixtures; green the full suite. All such changes are **additive/backward-compatible** (readers accept `schemaVersion ≤ CURRENT`), so old events still validate.

## What stays the same

This is **not** a hard serialization bottleneck — the parallel tracks keep running. It adds only a cheap announce + a pre-merge contract-state check. Non-contract code merges normally.
