# Calibrator Problem Recovery Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class `problem_recovery` review to Calibrator so humans can rate recovered problems separately from solutions on the same `-5` to `+5` scale.

**Architecture:** Keep the markdown vault authoritative and backward compatible. Extend schemas and index types so ratings can target either a problem recovery artifact or a solution artifact, then update the UI to switch rating targets without changing the storage truth. Preserve existing solution markdown and ratings while adding canonical run markdown support with `Trace`, `Case Study`, `Discovery`, `Problem Recovery`, and optional `Solution` sections.

**Tech Stack:** TypeScript, React, Vite, Vitest, `zod`, `gray-matter`, markdown vault files.

---

## File Structure

- Modify `calibrator/src/types.ts`: add `CalibratorProblemRecovery`, generalized rating target types, and optional run artifact linkage.
- Modify `calibrator/src/server/vaultSchemas.ts`: allow `rating_target: problem_recovery | solution`, add problem recovery frontmatter, accept legacy `adapter_version`, and add new `source_mapping_version`.
- Modify `calibrator/src/server/ratingWriter.ts`: write either problem recovery ratings or solution ratings with the right id field.
- Modify `calibrator/src/server/vaultReader.ts`: read legacy `problem.md`, new `problem-recoveries/*.md`, and future `runs/*.md` canonical artifacts.
- Create `calibrator/src/server/sectionParser.ts`: parse `# Trace`, `# Case Study`, `# Discovery`, `# Problem Recovery`, and `# Solution` from canonical markdown.
- Modify `calibrator/test/vaultSchemas.test.ts`: cover problem recovery rating schema.
- Modify `calibrator/test/ratingWriter.test.ts`: cover problem recovery rating file output.
- Modify `calibrator/test/vaultReader.test.ts`: cover indexed problem recovery records and canonical run markdown.
- Modify `calibrator/src/App.tsx`: add rating target switch, problem recovery panel, and remove reviewer-facing “adapter” labels.
- Modify `calibrator/test/App.test.tsx`: test target switching and problem recovery submission payload.
- Modify `calibration-vault/cases/fsd-accident-economy/problem.md`: rename context language to problem recovery where appropriate.
- Create `calibration-vault/cases/fsd-accident-economy/problem-recoveries/fsd-accident-economy-recovered-problem.md`: first rateable problem recovery fixture.
- Modify `calibrator/README.md`: document canonical markdown input and rating targets.
- Modify `docs/superpowers/plans/2026-06-22-calibrator-mvp.md`: update status notes so it no longer claims problem recovery is intentionally unrated.
- Regenerate `calibrator/public/calibration-index.json` and `published/calibrator/` through existing export scripts.

## Task 1: Generalize Rating Targets

**Files:**
- Modify: `calibrator/src/server/vaultSchemas.ts`
- Modify: `calibrator/src/server/ratingWriter.ts`
- Modify: `calibrator/src/types.ts`
- Test: `calibrator/test/vaultSchemas.test.ts`
- Test: `calibrator/test/ratingWriter.test.ts`

- [x] **Step 1: Add failing schema tests**

Add tests that parse both valid rating targets:

```ts
import { RatingFrontmatter, RatingSubmission } from "../src/server/vaultSchemas";

it("accepts a problem recovery rating submission", () => {
  expect(
    RatingSubmission.parse({
      case_id: "fsd-accident-economy",
      rating_target: "problem_recovery",
      problem_recovery_id: "pr_fsd_accident_economy",
      score: 4,
      notes: "Recovered the real economic dependency problem.",
    }),
  ).toMatchObject({
    rating_target: "problem_recovery",
    problem_recovery_id: "pr_fsd_accident_economy",
    score: 4,
  });
});

it("accepts stored problem recovery rating frontmatter", () => {
  expect(
    RatingFrontmatter.parse({
      artifact_type: "human_rating",
      rating_id: "rating_problem_recovery",
      rating_target: "problem_recovery",
      case_id: "fsd-accident-economy",
      problem_recovery_id: "pr_fsd_accident_economy",
      score: 5,
      scale_min: -5,
      scale_max: 5,
      submitted_at: "2026-06-22T00:00:00.000Z",
      app_version: "calibrator-v0",
    }),
  ).toMatchObject({
    rating_target: "problem_recovery",
    problem_recovery_id: "pr_fsd_accident_economy",
  });
});
```

- [x] **Step 2: Run schema tests to verify failure**

Run:

```bash
npm --prefix calibrator run test -- vaultSchemas
```

Expected: FAIL because `rating_target` currently only accepts `solution` and the schemas do not know `problem_recovery_id`.

- [x] **Step 3: Update rating schemas and shared types**

In `vaultSchemas.ts`, define target-aware schemas:

```ts
const RatingTarget = z.enum(["solution", "problem_recovery"]);

export const RatingSubmission = z
  .object({
    case_id: z.string().min(1),
    rating_target: RatingTarget.default("solution"),
    solution_id: z.string().min(1).optional(),
    problem_recovery_id: z.string().min(1).optional(),
    score: z.number().int().min(-5).max(5),
    verdict: z.enum(["dead", "obvious", "interesting", "investigate", "keeper"]).optional(),
    notes: z.string().default(""),
    reviewer_email: z.string().email().optional().or(z.literal("")),
    reviewer_name: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.rating_target === "solution" && !value.solution_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["solution_id"], message: "solution_id is required" });
    }
    if (value.rating_target === "problem_recovery" && !value.problem_recovery_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["problem_recovery_id"],
        message: "problem_recovery_id is required",
      });
    }
  });
```

Update `RatingFrontmatter` with the same target/id rule. In `types.ts`, make `CalibratorRating` include:

```ts
rating_target: "solution" | "problem_recovery";
solution_id?: string;
problem_recovery_id?: string;
```

- [x] **Step 4: Add failing writer test**

In `ratingWriter.test.ts`, add:

```ts
it("writes a problem recovery rating markdown file", async () => {
  const root = await mkdtemp(join(tmpdir(), "calibrator-rating-"));
  await mkdir(join(root, "calibration-vault/cases/fsd-accident-economy/ratings"), { recursive: true });

  const result = await writeRatingMarkdown({
    vaultRoot: join(root, "calibration-vault"),
    now: new Date("2026-06-22T12:00:00.000Z"),
    submission: {
      case_id: "fsd-accident-economy",
      rating_target: "problem_recovery",
      problem_recovery_id: "pr_fsd_accident_economy",
      score: 5,
      notes: "Strong recovered problem.",
      reviewer_email: "",
    },
  });

  const written = await readFile(result.absolutePath, "utf8");
  expect(written).toContain("rating_target: problem_recovery");
  expect(written).toContain("problem_recovery_id: pr_fsd_accident_economy");
  expect(written).not.toContain("solution_id:");
});
```

- [x] **Step 5: Run writer test to verify failure**

Run:

```bash
npm --prefix calibrator run test -- ratingWriter
```

Expected: FAIL because the writer assumes `solution_id`.

- [x] **Step 6: Update rating writer**

In `ratingWriter.ts`, derive the target id:

```ts
const targetId =
  submission.rating_target === "problem_recovery"
    ? submission.problem_recovery_id
    : submission.solution_id;

const ratingId = `rating_${timestampId(now)}_${safeIdPart(targetId)}`;
```

Write frontmatter with conditional ids:

```ts
const frontmatter = {
  artifact_type: "human_rating",
  rating_id: ratingId,
  rating_target: submission.rating_target,
  case_id: submission.case_id,
  solution_id: submission.rating_target === "solution" ? submission.solution_id : undefined,
  problem_recovery_id:
    submission.rating_target === "problem_recovery" ? submission.problem_recovery_id : undefined,
  score: submission.score,
  scale_min: -5,
  scale_max: 5,
  verdict: submission.verdict,
  reviewer_email: submission.reviewer_email,
  reviewer_name: submission.reviewer_name,
  submitted_at: now.toISOString(),
  app_version: "calibrator-v0",
};
```

- [x] **Step 7: Run target tests**

Run:

```bash
npm --prefix calibrator run test -- vaultSchemas ratingWriter
```

Expected: PASS.

- [x] **Step 8: Commit**

Run the established secret and commit-identity scan first. It should check for OpenRouter key patterns and disallowed author identity strings, and it should print no matches.

```bash
git diff --cached
```

Then commit:

```bash
git add calibrator/src/server/vaultSchemas.ts calibrator/src/server/ratingWriter.ts calibrator/src/types.ts calibrator/test/vaultSchemas.test.ts calibrator/test/ratingWriter.test.ts
git commit -m "feat: support problem recovery ratings"
```

## Task 2: Index Problem Recovery And Canonical Run Markdown

**Files:**
- Create: `calibrator/src/server/sectionParser.ts`
- Modify: `calibrator/src/server/vaultReader.ts`
- Modify: `calibrator/src/server/vaultSchemas.ts`
- Modify: `calibrator/src/types.ts`
- Create: `calibration-vault/cases/fsd-accident-economy/problem-recoveries/fsd-accident-economy-recovered-problem.md`
- Test: `calibrator/test/vaultReader.test.ts`

- [x] **Step 1: Add section parser tests through vault reader**

In `vaultReader.test.ts`, create a temporary case with `runs/run.md`:

```md
---
artifact_type: kernel_case_run
case_id: fsd-accident-economy
run_artifact_id: run_fixture
source_type: kernel
source_status: imported
kernel: cody
source_mapping_version: cody-runtime-importer-v1
created_at: 2026-06-22T00:00:00.000Z
---

# Trace

Step one.

# Case Study

Case body.

# Discovery

Discovery body.

# Problem Recovery

Recovered problem body.

# Solution

Solution body.
```

Assert:

```ts
expect(index.cases[0]?.problem_recoveries[0]).toMatchObject({
  problem_recovery_id: "run_fixture__problem_recovery",
  run_artifact_id: "run_fixture",
  title: "Problem Recovery",
});
expect(index.cases[0]?.solutions.some((solution) => solution.solution_id === "run_fixture__solution")).toBe(true);
```

- [x] **Step 2: Run reader tests to verify failure**

Run:

```bash
npm --prefix calibrator run test -- vaultReader
```

Expected: FAIL because the reader does not parse canonical run markdown or expose `problem_recoveries`.

- [x] **Step 3: Create section parser**

Create `sectionParser.ts`:

```ts
export interface MarkdownSections {
  trace?: string;
  caseStudy?: string;
  discovery?: string;
  problemRecovery?: string;
  solution?: string;
}

const sectionKeys: Record<string, keyof MarkdownSections> = {
  trace: "trace",
  "case study": "caseStudy",
  discovery: "discovery",
  "problem recovery": "problemRecovery",
  solution: "solution",
};

export function parseMarkdownSections(markdown: string): MarkdownSections {
  const sections: MarkdownSections = {};
  const matches = [...markdown.matchAll(/^#\s+(.+)$/gm)];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const title = match[1]?.trim().toLowerCase() ?? "";
    const key = sectionKeys[title];
    if (!key || match.index === undefined) continue;
    const bodyStart = match.index + match[0].length;
    const bodyEnd = matches[i + 1]?.index ?? markdown.length;
    const body = markdown.slice(bodyStart, bodyEnd).trim();
    if (body) sections[key] = body;
  }
  return sections;
}
```

- [x] **Step 4: Extend vault schemas and types**

Add `ProblemRecoveryFrontmatter` and `KernelCaseRunFrontmatter`. Add `problem_recoveries: CalibratorProblemRecovery[]` to `CalibratorCase`.

- [x] **Step 5: Read problem recovery files**

In `vaultReader.ts`, add `readProblemRecoveries(casePath)`. It should read `problem-recoveries/*.md`, parse frontmatter, attach ratings by `problem_recovery_id`, and return sorted records.

- [x] **Step 6: Read canonical run files**

In `vaultReader.ts`, add `readRunArtifacts(casePath)`. It should read `runs/*.md`, use `parseMarkdownSections`, and synthesize:

```ts
{
  problem_recovery_id: `${run_artifact_id}__problem_recovery`,
  run_artifact_id,
  title: "Problem Recovery",
  body: sections.problemRecovery,
  human_ratings: ratingsByProblemRecovery.get(id) ?? []
}
```

If `sections.solution` exists, synthesize a solution with `solution_id: ${run_artifact_id}__solution`.

- [x] **Step 7: Seed first problem recovery fixture**

Create `calibration-vault/cases/fsd-accident-economy/problem-recoveries/fsd-accident-economy-recovered-problem.md` with:

```md
---
artifact_type: problem_recovery
case_id: fsd-accident-economy
problem_recovery_id: pr_fsd_accident_economy_fixture
title: Accident Economy Dependency Shock
source_type: manual
source_status: fixture
created_at: 2026-06-22T00:00:00.000Z
---

# Accident Economy Dependency Shock

The recovered problem is that crash reduction removes a recurring event stream that many adjacent systems implicitly depend on: insurance acquisition, claims operations, repairs, towing, legal intake, trauma workflows, public cost recovery, media spend, and donor-supply edges.

The quality question is whether a kernel saw this as a dependency-unwind problem rather than only a safer-roads or cheaper-transportation story.
```

- [x] **Step 8: Run reader tests**

Run:

```bash
npm --prefix calibrator run test -- vaultReader
```

Expected: PASS.

- [x] **Step 9: Commit**

Run the established secret and commit-identity scan first. It should check for OpenRouter key patterns and disallowed author identity strings, and it should print no matches. Then commit:

```bash
git add calibrator/src/server/sectionParser.ts calibrator/src/server/vaultReader.ts calibrator/src/server/vaultSchemas.ts calibrator/src/types.ts calibrator/test/vaultReader.test.ts calibration-vault/cases/fsd-accident-economy/problem-recoveries/fsd-accident-economy-recovered-problem.md
git commit -m "feat: index calibrator problem recovery artifacts"
```

## Task 3: Add Problem Recovery Review UI

**Files:**
- Modify: `calibrator/src/App.tsx`
- Modify: `calibrator/src/styles.css`
- Test: `calibrator/test/App.test.tsx`

- [x] **Step 1: Add failing UI tests**

In `App.test.tsx`, extend the fixture index with one `problem_recoveries` entry and test:

```ts
expect(screen.getByRole("button", { name: "Problem Recovery" })).toBeInTheDocument();
await userEvent.click(screen.getByRole("button", { name: "Problem Recovery" }));
expect(screen.getByText("Accident Economy Dependency Shock")).toBeInTheDocument();
await userEvent.click(screen.getByRole("button", { name: "+4" }));
await userEvent.click(screen.getByRole("button", { name: "Submit rating" }));
expect(fetchMock).toHaveBeenCalledWith(
  "/api/ratings",
  expect.objectContaining({
    method: "POST",
    body: expect.stringContaining('"rating_target":"problem_recovery"'),
  }),
);
```

- [x] **Step 2: Run UI test to verify failure**

Run:

```bash
npm --prefix calibrator run test -- App
```

Expected: FAIL because there is no target switch and no problem recovery payload.

- [x] **Step 3: Add rating target state**

In `App.tsx`, add:

```ts
const [ratingTarget, setRatingTarget] = useState<"problem_recovery" | "solution">("solution");
const selectedProblemRecovery = selectedCase.problem_recoveries[0] ?? null;
```

Build `activeReviewTarget`:

```ts
const activeReviewTarget =
  ratingTarget === "problem_recovery" ? selectedProblemRecovery : selectedSolution;
```

- [x] **Step 4: Render target switch**

Add a compact two-button segmented control:

```tsx
<div className="target-switch" aria-label="Rating target">
  <button type="button" className={ratingTarget === "problem_recovery" ? "active" : ""} onClick={() => setRatingTarget("problem_recovery")}>
    Problem Recovery
  </button>
  <button type="button" className={ratingTarget === "solution" ? "active" : ""} onClick={() => setRatingTarget("solution")}>
    Solution
  </button>
</div>
```

- [x] **Step 5: Render problem recovery panel**

Display selected problem recovery title, body, source status, and calibration history. The panel should use existing markdown rendering and collapse behavior.

- [x] **Step 6: Submit correct payload**

Change the submit body:

```ts
body: JSON.stringify({
  case_id: selectedCase.case_id,
  rating_target: ratingTarget,
  solution_id: ratingTarget === "solution" ? selectedSolution?.solution_id : undefined,
  problem_recovery_id:
    ratingTarget === "problem_recovery" ? selectedProblemRecovery?.problem_recovery_id : undefined,
  score,
  verdict: verdict || undefined,
  notes,
  reviewer_email: reviewerEmail,
}),
```

- [x] **Step 7: Remove reviewer-facing adapter labels**

In `KernelMeta`, change the displayed label from `adapter` to `source mapping`. Keep reading `adapter_version` for legacy data, but do not render the word `adapter` in normal visible labels.

- [x] **Step 8: Run UI tests**

Run:

```bash
npm --prefix calibrator run test -- App
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run the established secret and commit-identity scan first. It should check for OpenRouter key patterns and disallowed author identity strings, and it should print no matches. Then commit:

```bash
git add calibrator/src/App.tsx calibrator/src/styles.css calibrator/test/App.test.tsx
git commit -m "feat: add problem recovery review ui"
```

## Task 4: Export Static Preview And Update Docs

**Files:**
- Modify: `calibrator/README.md`
- Modify: `docs/superpowers/plans/2026-06-22-calibrator-mvp.md`
- Modify: `calibrator/public/calibration-index.json`
- Modify: `published/calibrator/`

- [ ] **Step 1: Update README**

Document:

- Canonical markdown section order: `Trace`, `Case Study`, `Discovery`, `Problem Recovery`, optional `Solution`.
- Rating targets: `problem_recovery` and `solution`.
- `source_mapping_version` replaces new uses of `adapter_version`; legacy files remain readable.

- [ ] **Step 2: Update MVP plan status**

Add status lines:

```md
- Problem recovery is now a first-class rating target using the same `-5` to `+5` scale as solutions.
- Canonical kernel case-run markdown can preserve Trace, Case Study, Discovery, Problem Recovery, and optional Solution in one artifact.
```

Replace stale language saying the MVP intentionally does not collect problem recovery ratings.

- [ ] **Step 3: Run full tests**

Run:

```bash
npm --prefix calibrator run test
```

Expected: PASS.

- [ ] **Step 4: Export static preview**

Run:

```bash
npm --prefix calibrator run export:static
```

Expected: PASS and regenerated `calibrator/public/calibration-index.json` plus `published/calibrator/`.

- [ ] **Step 5: Structural preview check**

Run:

```bash
rg -n "Problem Recovery|rating_target|source mapping" calibrator/public/calibration-index.json published/calibrator/assets published/calibrator/index.html
```

Expected: output contains `Problem Recovery` and the new rating target text. `source mapping` may appear in bundled JS.

- [ ] **Step 6: Commit**

Run the established secret and commit-identity scan first. It should check for OpenRouter key patterns and disallowed author identity strings, and it should print no matches. Then commit:

```bash
git add calibrator/README.md docs/superpowers/plans/2026-06-22-calibrator-mvp.md calibrator/public/calibration-index.json published/calibrator
git commit -m "docs: publish calibrator problem recovery preview"
```

## Task 5: Push And Verify

**Files:**
- No source edits expected.

- [ ] **Step 1: Verify commit identity**

Run:

```bash
git log -5 --format='%h%x09%an%x09%ae%x09%cn%x09%ce%x09%s'
git log --format='%H%x09%an%x09%ae%x09%cn%x09%ce%x09%s' calibration
```

Expected: recent commits use `loopstrangest`; no disallowed identity strings appear in the branch history.

- [ ] **Step 2: Push branch**

Run:

```bash
git push origin calibration
```

Expected: push succeeds.

- [ ] **Step 3: Verify GitHub Pages deployment**

Run:

```bash
gh -R Doppl-Life/doppl-prime run list --branch calibration --limit 5
curl -I https://doppl-life.github.io/doppl-prime/calibrator/
```

Expected: latest `Deploy Published Preview` succeeds and URL returns `HTTP/2 200`.

- [ ] **Step 4: Final status**

Run:

```bash
git status --short --branch
```

Expected: clean working tree on `calibration`.

## Self-Review

- Spec coverage: Covers separate problem recovery rating, same `-5` to `+5` scale, canonical markdown input shape, trace preservation, optional solution, importer terminology cleanup, backward compatibility, UI target switching, and static preview publication.
- Placeholder scan: No placeholder markers or unspecified implementation steps remain.
- Type consistency: Uses `problem_recovery`, `problem_recovery_id`, `solution`, `solution_id`, `source_mapping_version`, and legacy `adapter_version` consistently across schemas, reader, writer, UI, and docs.
