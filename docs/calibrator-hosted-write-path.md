# Calibrator Hosted Write Path

Status: active implementation contract
Branch: `calibration`
Updated: 2026-06-24

## Purpose

The calibrator's production write path must update the canonical aGarden repository without exposing GitHub credentials to browser code.

For the broader read/write/projection lifecycle and prioritized implementation order, see `docs/calibrator-agarden-lifecycle.md`.

The durable source of truth is:

- `Doppl-Life/agarden` markdown nodes under the aGarden folder tree
- root `ratings-ledger.json`

Every accepted human rating must:

- upsert one current ledger rating for `(node_id, rater_id)`
- recompute the selected node's `scores.human` and `scores.n`
- commit the ledger and node projection together

If a database/cache row disagrees with aGarden markdown or `ratings-ledger.json`, aGarden wins.

## Endpoint

```http
POST /api/agarden/ratings
Content-Type: application/json
Idempotency-Key: <stable-client-generated-key>
Authorization: Bearer <session-token>
```

The hosted endpoint should accept the same core body as the local Vite dev API plus the true aGarden `node_id`:

```json
{
  "case_id": "fsd-accident-economy",
  "rating_target": "solution",
  "solution_id": "dalton-fsd-accident-economy-001__solution",
  "node_id": "dalton-fsd-accident-economy-001__solution",
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
3. Validate the resulting reviewer email against the shared allow-list.
4. Preserve `rater_id` in the ratings ledger.
5. Never write secrets, access tokens, session tokens, GitHub App keys, or provider keys into aGarden.

The static GitHub Pages preview remains read-only. Writable hosted mode must be a separate deployment with server-side aGarden write access.

The browser discovers that hosted deployment through the public `calibrator-config.js` file:

```js
window.DOPPL_CALIBRATOR_CONFIG = {
  ratingsEndpoint: "https://example-host/api/agarden/ratings",
  requiresAccessCode: true,
};
```

Those values are public browser configuration. They are not authorization secrets and must not grant write access by themselves. When `requiresAccessCode` is true, the browser asks the reviewer for a session access code and sends it as `Authorization: Bearer <code>`. The code itself must be distributed out of band and stored only as the Railway `CALIBRATOR_WRITE_TOKEN` variable.

Recommended credential model:

- Use a GitHub App installed only on `Doppl-Life/agarden`.
- Store `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_APP_INSTALLATION_ID` only in server environment variables.
- Give the app contents read/write permission for `agarden`; avoid broad org permissions.
- Never ship those values in `published/`, Vite client env, or GitHub Pages assets.

Pragmatic fallback while GitHub App org installation is blocked:

- Use a fine-grained personal access token stored only in Railway as `AGARDEN_GITHUB_TOKEN`.
- Scope the token only to `Doppl-Life/agarden`.
- Grant only `Metadata: read` and `Contents: read/write`.
- Rotate or remove the token after the GitHub App installation is correctly configured.
- Browser behavior does not change; the browser still sends ratings only to the Railway API with the reviewer session access code.

Credential selection in production:

1. If `AGARDEN_GITHUB_TOKEN` is present, Railway uses that token for aGarden GitHub writes.
2. Otherwise, Railway uses the GitHub App variables.
3. GitHub credentials are never read from or sent to browser code.

The deployable server entrypoint is:

```bash
npm --prefix calibrator run serve:ratings
```

The deployed Railway service currently uses this entrypoint for:

- `GET /health`
- `POST /api/agarden/ratings`

The smoke-test command is:

```bash
CALIBRATOR_HOSTED_RATINGS_URL=https://calibrator-ratings-production.up.railway.app/api/agarden/ratings \
CALIBRATOR_HOSTED_RATINGS_ACCESS_CODE=<session access code> \
CALIBRATOR_SMOKE_ALLOW_WRITE=true \
npm --prefix calibrator run smoke:hosted-ratings
```

The smoke script is intentionally skipped unless all required environment variables are present. Run it only after confirming Railway targets the safe `AGARDEN_BRANCH=calibrator-ratings-smoke` branch. It posts one rating upsert for the first primary aGarden artifact in the current static index, then prints commit/projection metadata without printing the access code.

Required environment variables:

- `CALIBRATOR_WRITE_TOKEN`

Required GitHub write credentials, choose one mode:

- PAT fallback mode: `AGARDEN_GITHUB_TOKEN`
- GitHub App mode: `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`

Optional environment variables:

- `PORT`, default `8787`
- `AGARDEN_OWNER`, default `Doppl-Life`
- `AGARDEN_REPO`, default `agarden`
- `AGARDEN_BRANCH`, default `main`
- `CALIBRATOR_INDEX_PATH`, default `calibrator/public/calibration-index.json`
- `CALIBRATOR_ALLOWED_ORIGINS`, comma-separated, default `https://doppl-life.github.io,http://127.0.0.1:5178`
- `CALIBRATOR_ALLOW_UNAUTHENTICATED_WRITES=true`, local/testing escape hatch only; do not set in production

## Validation

The server must reject:

- missing or mismatched `Authorization: Bearer <CALIBRATOR_WRITE_TOKEN>` in hosted production mode
- scores outside `-5` to `+5`
- non-integer scores
- missing `solution_id` for solution ratings
- missing `problem_recovery_id` for problem recovery ratings
- missing or mismatched `node_id`
- unknown `case_id`
- unknown node id
- ratings for non-primary artifacts

Primary rateable artifacts are imported or live kernel outputs:

- `source_status: imported`
- `source_status: live_run`

Non-primary artifacts are not shown in the reviewer path and are not human-rating targets:

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
  "ratingId": "dalton-fsd-accident-economy-001__solution:reviewer@gauntletai.com",
  "commitSha": "abc1234",
  "ledgerPath": "ratings-ledger.json",
  "nodePath": "flow/fsd-accident-economy/doppls/dalton-fsd-accident-economy-001__solution.md",
  "scores": { "human": 4, "n": 1 },
  "retried": false
}
```

## Write Flow

1. Authenticate reviewer.
2. Fetch current `ratings-ledger.json` and selected node markdown from `Doppl-Life/agarden`.
3. Validate directly against the current aGarden index/node metadata.
4. Validate payload against `RatingSubmission`.
5. Confirm target artifact is primary rateable.
6. Upsert rating by `(node_id, rater_id)` in the ledger.
7. Recompute projection from the full ledger entry for that node.
8. Materialize `scores.human` and `scores.n` into the node markdown.
9. Commit ledger and node projection in one GitHub commit.
10. If GitHub reports stale SHAs, refetch, reapply once, and retry.
11. Return commit metadata, touched paths, and updated projection.

## Downstream Use

Doppl kernels should ingest aGarden ratings-ledger entries and node score projections as evaluation evidence. The calibrator does not decide which kernel is best by itself; it produces durable human-scored traces that later selection, training, and knowledge-space processes can consume.
