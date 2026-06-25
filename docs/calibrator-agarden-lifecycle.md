# Calibrator aGarden Lifecycle

Status: active implementation guide
Branch: `calibration`
Updated: 2026-06-24

## Intended End-to-End Loop

The calibrator is the Judgment UI for aGarden. aGarden is the durable file store. The intended lifecycle has three automatic loops.

### 1. Latest aGarden Nodes Appear In Calibrator

Intended process:

1. Kernels create or update aGarden markdown nodes in `Doppl-Life/agarden`.
2. Each rateable node has stable frontmatter, especially `id`, `stage`, `scores`, and parent/child metadata.
3. The calibrator indexer reads the latest aGarden `flow/` tree and root `ratings-ledger.json`.
4. Case-study nodes become case options.
5. `stage: problem_recovery` nodes become Problem recovery review options.
6. `stage: doppl` nodes become Doppl review options.
7. The deployed calibrator refreshes its static index whenever aGarden changes, so reviewers see the latest rateable nodes without manual local export work.

Current state:

- Local development already reads the sibling `../agarden/` checkout by default.
- Static export already serializes aGarden nodes into `calibrator/public/calibration-index.json` and `published/calibrator/calibration-index.json`.
- The live GitHub Pages calibrator shows only the last committed static export from `doppl-prime/calibration`.
- Empty/non-rateable aGarden cases and non-primary artifacts are filtered out of the reviewer path, so reviewers see only problem recoveries and doppls they can rate.
- There is no fully automatic cross-repo refresh from `Doppl-Life/agarden/main` to the live Pages bundle yet.

Remaining work:

- Add a `doppl-prime` workflow that checks out both `doppl-prime/calibration` and `Doppl-Life/agarden/main`, regenerates the calibrator static export, commits changed `published/**`, and lets the existing Pages deployment publish it. Implemented as `.github/workflows/refresh-calibrator-agarden.yml` on `calibration`.
- Make that refresh actually automatic. Remaining: GitHub scheduled/manual workflows are only discoverable from the repository default branch, so the `calibration` copy is an implementation template until either a default-branch workflow is approved or an external dispatcher with scoped credentials calls it.
- Later, add a repository-dispatch trigger from `agarden` after pushes to `main` if a scoped secret or GitHub App token is approved for cross-repo dispatch.
- Add a visible generated-at/source commit marker if reviewers need to know exactly which aGarden commit they are rating.

### 2. Calibrator Ratings Are Written To The Ratings Ledger

Intended process:

1. A reviewer chooses a case study.
2. The reviewer toggles between Problem recoveries and Doppls.
3. The reviewer selects one rateable artifact.
4. The reviewer selects an allow-listed identity and submits a `-5..+5` score with optional notes.
5. Browser code posts only non-secret rating data to a hosted ratings API.
6. The hosted API validates the rater, score, case, selected artifact, `node_id`, and source status.
7. The hosted API reads the current `ratings-ledger.json` from `Doppl-Life/agarden`.
8. The hosted API upserts exactly one current rating for `(node_id, rater_id)`.
9. The hosted API commits the updated ledger to `Doppl-Life/agarden`.

Current state:

- Local Vite dev mode already writes to the local aGarden checkout through `/api/ratings`.
- Local writes upsert by `(node_id, rater_id)`.
- Server-side validation uses the shared allow-list and `RatingSubmission` schema.
- A tested server-only GitHub writer core exists.
- A tested server-only GitHub API client exists, including GitHub App installation-token exchange.
- The GitHub Pages app now has `calibrator-config.js`, a public non-secret runtime config file. If `ratingsEndpoint` is empty, Pages remains read-only. If it points at a hosted ratings API, the browser can post there.
- A Railway `calibrator-ratings` service is deployed from `doppl-prime/calibrator` with `GET /health` and `POST /api/agarden/ratings`.
- The current fork proof allows reviewer submissions without an access/session code by setting `CALIBRATOR_ALLOW_UNAUTHENTICATED_WRITES=true` on Railway and `requiresAccessCode: false` in public config.
- The browser sends only reviewer email plus rating payload; no GitHub credential or write token is committed to the static app.
- Railway is configured for `AGARDEN_OWNER=loopstrangest`, `AGARDEN_REPO=agarden`, `AGARDEN_BRANCH=main`, and uses `AGARDEN_GITHUB_TOKEN` as a fine-grained fork-scoped fallback credential.
- The hosted service still supports the preferred GitHub App path for later canonical `Doppl-Life/agarden` writes once org installation permissions are unblocked.

Remaining work:

- For the preferred later path, after owner approval, set `GITHUB_APP_INSTALLATION_ID` on the Railway service and remove the PAT fallback.
- Move Railway from `loopstrangest/agarden` to `Doppl-Life/agarden` when canonical org writes are approved.
- Add a stronger no-typing auth model, such as GitHub OAuth or a signed reviewer session, before allowing broad canonical writes. CORS plus reviewer allow-list is acceptable for the fork proof but is not full per-user authentication.

### 3. Ratings Ledger Scores Are Projected Back Into Nodes

Intended process:

1. The ratings ledger remains the source of truth for human ratings.
2. After every accepted rating, the writer recomputes the selected node's current projection from the full ledger entry.
3. The node markdown frontmatter receives:

```yaml
scores:
  human: <average or null>
  n: <unique rater count>
```

4. The ledger update and node projection update land in the same Git commit.
5. The next calibrator index refresh reads both:
   - ledger entries for rating history
   - node `scores.human` / `scores.n` for compact score display and downstream kernel consumption

Current state:

- Local aGarden writes already materialize `scores.human` and `scores.n` into the selected node markdown.
- The server-only GitHub writer core already commits `ratings-ledger.json` and the node markdown projection together.
- The reader already attaches ledger ratings back to their matching problem recovery or doppl artifacts.
- The deployed Pages app shows whatever score projections and ratings existed in the last committed static export.
- A reviewer-specific queue is implemented: `Next unrated` means unrated by the selected allow-listed reviewer, based on ledger-backed ratings in the index.

Remaining work:

- Complete the hosted API smoke test once the GitHub App installation ID is available.
- Ensure a successful hosted write rebuilds or triggers a refresh of the static calibrator index after committing to aGarden.
- Decide whether the API response should optimistically update the browser immediately, wait for the next static refresh, or both.
- Add an operational check that detects ledger/node projection drift and reports it.

## Prioritized Work Order

1. **Automate latest aGarden read refresh.** Partially implemented.
   This makes the live calibrator reflect new aGarden nodes and score projections without manual local exports. It is also low-risk because it does not write to `agarden`.

2. **Add hosted ratings API route skeleton.** Done.
   The browser already has a `ratingsEndpoint` seam and the server writer/client cores exist. `calibrator/src/server/hostedAgardenRatingApi.ts` now covers request parsing, validation, CORS preflight, response shape, and calls into the tested GitHub writer.

3. **Deploy hosted ratings API with server-held GitHub App credentials.** In progress.
   This is where real writes become possible. Use GitHub App credentials installed only on `Doppl-Life/agarden`; never expose them through Pages. `npm --prefix calibrator run serve:ratings` now starts a plain Node server with `GET /health` and `POST /api/agarden/ratings`.

4. **Smoke hosted writes against a test branch.** Next.
   Prove ledger upsert plus node projection commit in GitHub before touching `agarden/main`. The command is:

   ```bash
   CALIBRATOR_HOSTED_RATINGS_URL=https://calibrator-ratings-production.up.railway.app/api/agarden/ratings \
   CALIBRATOR_HOSTED_RATINGS_ACCESS_CODE=<session access code> \
   CALIBRATOR_SMOKE_ALLOW_WRITE=true \
   npm --prefix calibrator run smoke:hosted-ratings
   ```

   Run this only after Railway is confirmed to target `AGARDEN_BRANCH=calibrator-ratings-smoke` and either `AGARDEN_GITHUB_TOKEN` or working GitHub App credentials are set. The script prints only response metadata, never the access code.

5. **Enable production writes from Pages.**
   Set `calibrator-config.js` to the hosted API URL only after the route and GitHub App write flow are verified.

6. **Add post-write refresh.**
   After a successful hosted write, trigger the static refresh workflow or return enough updated projection data for immediate UI refresh while the static export catches up.

7. **Add drift/audit checks.**
   Periodically compare `ratings-ledger.json` with node frontmatter projections and report or repair mismatches.

## Current Short Version

- Latest nodes shown automatically: local yes, production partially; needs a discoverable/triggered GitHub Action refresh from `agarden/main`.
- Ratings written automatically to ledger: local yes; hosted API deployed and gated; real GitHub writes can now use a fine-grained Railway PAT fallback while the GitHub App installation remains blocked.
- Ledger scores shown in nodes: local yes; server writer core yes; production projection should work after the hosted smoke write, but static refresh after write still remains.
