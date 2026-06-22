# Calibrator Hosted Write Path

Status: proposed contract
Branch: `calibration`
Updated: 2026-06-22

## Purpose

The calibrator's markdown vault remains the source of truth. Hosted storage may add auth, queues, object storage, a database index, or analytics, but every accepted human rating must still materialize as:

- `calibration-vault/cases/<case_id>/ratings/<rating_id>.md`
- one append-only event in `calibration-vault/ratings-ledger.jsonl`

If a database row disagrees with the markdown rating, the markdown rating wins.

## Endpoint

```http
POST /api/ratings
Content-Type: application/json
Idempotency-Key: <stable-client-generated-key>
Authorization: Bearer <session-token>
```

The hosted endpoint should accept the same core body as the local Vite dev API:

```json
{
  "case_id": "fsd-accident-economy",
  "rating_target": "solution",
  "solution_id": "dalton-fsd-accident-economy-001__solution",
  "score": 4,
  "notes": "Strong transition ledger; would improve with explicit stakeholder migration risk.",
  "reviewer_email": "reviewer@gauntletai.com"
}
```

For problem recovery ratings, replace `solution_id` with `problem_recovery_id` and set `rating_target` to `problem_recovery`.

## Auth Boundary

Authentication is provenance, not storage truth.

The hosted service should:

1. Require a signed-in reviewer before writing.
2. Prefer the authenticated Gauntlet email over any client-supplied `reviewer_email`.
3. Preserve `reviewer_email` in rating markdown when available.
4. Never write secrets, access tokens, session tokens, or provider keys into the vault.

The static GitHub Pages preview remains read-only. Writable hosted mode should be a separate deployment with server-side vault write access.

## Validation

The server must reject:

- scores outside `-5` to `+5`
- non-integer scores
- missing `solution_id` for solution ratings
- missing `problem_recovery_id` for problem recovery ratings
- unknown `case_id`
- ratings for audit-only artifacts

Primary rateable artifacts are imported or live kernel outputs:

- `source_status: imported`
- `source_status: live_run`

Audit-only artifacts remain visible for provenance but are not human-rating targets:

- `source_status: fixture`
- `source_status: pending`
- missing or unknown source status

Importers should not emit review artifacts for branches that have no case-specific output. If an adapter only discovers runtime architecture or code capability evidence, preserve that finding in importer logs or project docs rather than creating an `unavailable` solution.

## Idempotency

Hosted writes should require an `Idempotency-Key`.

If the same authenticated reviewer sends the same idempotency key again, the server should return the original rating response without writing a second markdown file or ledger event.

Recommended response:

```json
{
  "ratingId": "rating_20260622T120000000Z_dalton-fsd-accident-economy-001__solution",
  "relativePath": "calibration-vault/cases/fsd-accident-economy/ratings/rating_20260622T120000000Z_dalton-fsd-accident-economy-001__solution.md",
  "ledgerRelativePath": "calibration-vault/ratings-ledger.jsonl"
}
```

## Write Flow

1. Authenticate reviewer.
2. Load current vault index or validate directly against vault files.
3. Confirm target artifact is primary rateable.
4. Validate payload against `RatingSubmission`.
5. Generate deterministic-enough rating id using server time and target id.
6. Write rating markdown.
7. Append one JSONL ledger event.
8. Refresh or invalidate the generated index.
9. Return rating id and vault paths.

## Downstream Use

Doppl kernels should ingest rating markdown and ledger events as evaluation evidence. The calibrator does not decide which kernel is best by itself; it produces durable human-scored traces that later selection, training, and knowledge-space processes can consume.
