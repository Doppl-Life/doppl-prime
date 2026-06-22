# Calibrator MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local vault-first calibrator web app where reviewers inspect `fsd-accident-economy` solutions and submit `-5` to `+5` solution ratings as markdown files.

**Architecture:** Keep the markdown vault authoritative. A small root `calibrator/` Node/Vite app reads `calibration-vault/`, validates frontmatter, generates a JSON index for the browser, and exposes a local dev API that writes rating markdown back into the vault. The browser UI is derived from the generated index and never becomes storage truth.

**Tech Stack:** Node 20+, TypeScript, Vite, React, Vitest, `gray-matter` for markdown frontmatter, `zod` for validation.

## Implementation Status

Completed on the `calibration` branch and pushed to GitHub:

- `737cc08 docs: define calibrator vault design`
- `23e0c00 docs: plan calibrator mvp`
- `426cb05 feat: seed calibrator vault`
- `a500b14 feat: scaffold calibrator app`
- `22807d3 feat: add calibrator vault rating writer`
- `908d4a5 feat: index calibrator vault`
- `6af0ee7 feat: add calibrator local write api`
- `a1c3f57 feat: build calibrator review workbench`

Current MVP behavior:

- The markdown vault under `calibration-vault/` is the source of truth for case, problem-context, solution, and human-rating artifacts.
- The local Vite app reads live vault content through `/api/index`.
- Human solution ratings are submitted on a `-5` to `+5` scale and written back as markdown under the case `ratings/` folder.
- The UI supports case selection, solution selection, expandable case/problem/solution details, optional reviewer email, notes, and saved-path feedback.
- The seeded fixture includes `fsd-accident-economy` plus Cody- and Melissa-labeled solution artifacts.
- Michael's `fsd-accident-economy` assay fixture has been added as a third solution artifact, and the rating contract now supports Michael-style verdicts: `dead`, `obvious`, `interesting`, `investigate`, and `keeper`.
- Solution frontmatter now allows `output_class`, `phase`, and `subtype` so the vault can distinguish final solution candidates from assay branches, Pepsis, and many-Pepsis outputs.
- Each local rating submit writes both a human-readable markdown rating and an append-only `calibration-vault/ratings-ledger.jsonl` event for downstream ingestion.
- The Vite app can build as a read-only static preview by falling back to `calibration-index.json`; live rating writes still require the local dev API or a future hosted backend.
- Existing rating markdown is now ingested back into the vault index and attached to matching solutions.
- Each solution displays human calibration history: rating count, average human score, judge-score delta, and verdict distribution.
- After a local submit, the app refreshes the vault index so the saved rating appears in the workbench immediately.
- GitHub Pages is enabled for the `calibration` branch and publishes the static preview from the committed `published/` folder.
- Apples-to-apples comparison is now explicit in the vault through `calibration-vault/comparison-sets/fsd-accident-economy-v0.md`.
- The current Cody-, Melissa-, and Michael-labeled artifacts are marked `source_status: fixture`; future adapters must promote them to `imported` or `live_run` only with branch, commit, source artifact/run id, and shared input hash.
- The UI shows comparison-set status and per-solution adapter notes so reviewers can distinguish seeded fixtures from genuine kernel outputs.
- The calibrator has an SVG favicon wired into the app and static export.
- The import CLI now has adapters for Michael markdown and Cody/Melissa runtime branch provenance.
- Michael's direct branch solution import is marked `pending` because the source branch explicitly says the case is unsolved.
- Cody and Melissa provenance imports are marked `unavailable` because neither branch currently has a direct case-specific solution export.
- Reviewers can filter solutions by source status and enable blind review mode to mask kernel/source labels before rating.

Verification as of June 22, 2026:

- `npm --prefix calibrator run test`: 4 files, 8 tests passing.
- `npm --prefix calibrator run build`: passing.
- `npm --prefix calibrator run export:static`: passing.
- Browser visual QA at `http://127.0.0.1:5178`: no horizontal overflow at mobile or 1280x800 desktop; desktop rating submit is visible in the left rail.

---

## File Structure

- Create `calibration-vault/cases/fsd-accident-economy/case.md`: normalized reviewer-visible case context.
- Create `calibration-vault/cases/fsd-accident-economy/problem.md`: context-only problem statement.
- Create `calibration-vault/cases/fsd-accident-economy/solutions/cody-accident-economy-map.md`: Cody-labeled sample solution artifact.
- Create `calibration-vault/cases/fsd-accident-economy/solutions/melissa-accident-economy-map.md`: Melissa-labeled sample solution artifact.
- Create `calibration-vault/cases/fsd-accident-economy/ratings/.gitkeep`: keeps rating destination in git without committing future reviewer submissions unless intentionally added.
- Create `calibrator/package.json`: local app scripts and dependencies.
- Create `calibrator/tsconfig.json`: TypeScript config.
- Create `calibrator/vite.config.ts`: Vite config with dev API middleware.
- Create `calibrator/index.html`: app mount.
- Create `calibrator/src/main.tsx`: React boot.
- Create `calibrator/src/App.tsx`: review workbench UI.
- Create `calibrator/src/styles.css`: app styling.
- Create `calibrator/src/types.ts`: shared browser-side types matching generated index.
- Create `calibrator/src/server/vaultSchemas.ts`: zod schemas for case/problem/solution/rating frontmatter and rating submission.
- Create `calibrator/src/server/vaultPaths.ts`: path helpers rooted at repo + vault.
- Create `calibrator/src/server/vaultReader.ts`: reads markdown vault and returns typed index.
- Create `calibrator/src/server/ratingWriter.ts`: validates submission and writes rating markdown.
- Create `calibrator/src/server/devApi.ts`: Vite dev middleware for `/api/index` and `/api/ratings`.
- Create `calibrator/src/server/generateIndex.ts`: CLI script to emit `calibrator/public/calibration-index.json`.
- Create `calibrator/public/.gitkeep`: keeps public folder.
- Create `calibrator/test/vaultSchemas.test.ts`: schema tests.
- Create `calibrator/test/vaultReader.test.ts`: fixture parsing tests.
- Create `calibrator/test/ratingWriter.test.ts`: rating creation tests.
- Create `calibrator/test/App.test.tsx`: UI behavior tests.

## Task 1: Seed The Markdown Vault

**Files:**
- Create: `calibration-vault/cases/fsd-accident-economy/case.md`
- Create: `calibration-vault/cases/fsd-accident-economy/problem.md`
- Create: `calibration-vault/cases/fsd-accident-economy/solutions/cody-accident-economy-map.md`
- Create: `calibration-vault/cases/fsd-accident-economy/solutions/melissa-accident-economy-map.md`
- Create: `calibration-vault/cases/fsd-accident-economy/ratings/.gitkeep`

- [ ] **Step 1: Create the vault folders**

Run:

```bash
mkdir -p calibration-vault/cases/fsd-accident-economy/solutions calibration-vault/cases/fsd-accident-economy/ratings
```

Expected: command exits 0.

- [ ] **Step 2: Add `case.md`**

Create `calibration-vault/cases/fsd-accident-economy/case.md`:

```markdown
---
artifact_type: case
case_id: fsd-accident-economy
title: When the Crashes Don't Come
source_paths:
  - case-studies/fsd-accident-economy/problem-statement.md
  - case-studies-revised/fsd-accident-economy/case-study.md
visibility: internal
created_at: 2026-06-22T00:00:00.000Z
---

# When the Crashes Don't Come

As of June 22, 2026, the case asks what happens if full self-driving reduces human-caused crash volume at scale. The visible story is cheaper rides and driver displacement, but the deeper question is whether crash-linked economic systems are prepared for a major demand shock.

## Reviewer Context

Reviewers should judge whether a solution maps the dependency web created by crashes, identifies exposed institutions, and makes useful second- and third-order claims without trying to preserve the harm itself.

## Source Notes

This normalized case is derived from the existing `fsd-accident-economy` case-study files. It is a review fixture for Calibrator MVP, not a new forecast.
```

- [ ] **Step 3: Add `problem.md`**

Create `calibration-vault/cases/fsd-accident-economy/problem.md`:

```markdown
---
artifact_type: problem
case_id: fsd-accident-economy
rating_target: context_only
source: case-study
---

# Problem Context

The problem is not simply that autonomous vehicles make ride-hailing cheaper. The deeper problem is that a large recurring source of harm also supports insurance pools, claims administration, collision repair, towing, storage, salvage, injury litigation, trauma care, rehabilitation, public cost recovery, and household disruption management.

Reviewers should use this context to evaluate solution quality, but the MVP does not collect a separate problem-recovery rating.
```

- [ ] **Step 4: Add Cody-labeled sample solution**

Create `calibration-vault/cases/fsd-accident-economy/solutions/cody-accident-economy-map.md`:

```markdown
---
artifact_type: solution
case_id: fsd-accident-economy
solution_id: cody-accident-economy-map
title: Crash Substrate Exposure Map
source_type: kernel
kernel: cody
branch: cody
run_id: run_fixture_cody_001
generation_id: gen_2
agenome_id: age_cody_7
candidate_id: cand_cody_accident_map
judge_score: 3.7
fitness_score: 0.81
created_at: 2026-06-22T00:00:00.000Z
---

# Crash Substrate Exposure Map

Map the crash-dependent economy as a substrate unwind. Separate institutions paid per crash from institutions maintaining capacity because crashes arrive frequently enough to justify it.

## Proposed Response

1. Build a dependency map for insurance, claims, repair, towing, salvage, litigation, emergency care, trauma centers, rehabilitation, and public agencies.
2. Mark each dependency by exposure timing: immediate revenue loss, medium-term capacity strandedness, or long-tail liability redesign.
3. Treat remaining crashes as potentially rarer but more expensive because vehicle software records, sensors, calibration, and product-liability questions change the cost structure.
4. Identify second-order effects in insurer advertising, plaintiff-firm acquisition channels, trauma center volume, donor-organ supply, and municipal crash-cost recovery.

## Why This Fits

The solution focuses on breadth before depth, then isolates the non-obvious edges where falling crash volume changes adjacent markets rather than only transport labor.
```

- [ ] **Step 5: Add Melissa-labeled sample solution**

Create `calibration-vault/cases/fsd-accident-economy/solutions/melissa-accident-economy-map.md`:

```markdown
---
artifact_type: solution
case_id: fsd-accident-economy
solution_id: melissa-accident-economy-map
title: Accident Demand Shock Readiness Plan
source_type: kernel
kernel: melissa
branch: melissa
run_id: run_fixture_melissa_001
generation_id: gen_2
agenome_id: age_melissa_4
candidate_id: cand_melissa_accident_plan
judge_score: 3.5
fitness_score: 0.78
created_at: 2026-06-22T00:00:00.000Z
---

# Accident Demand Shock Readiness Plan

Treat crash reduction as a demand-shock planning problem. The solution should help exposed institutions forecast volume decline, redesign products, and move capacity toward remaining high-value needs.

## Proposed Response

1. Create an exposure ledger for organizations whose revenue, staffing, or public mandate depends on crash frequency.
2. For each sector, classify the adaptive path: shrink, consolidate, reprice, shift liability, convert capacity, or redesign public funding.
3. Compare human-caused crash decline against remaining autonomous-vehicle incidents, where fewer events may carry higher complexity and different defendants.
4. Define early-warning indicators: claim count, severity, repair mix, tow volume, injury-litigation intake, trauma admissions, and insurance ad spend.

## Why This Fits

The solution is operational: it converts a zeitgeist thesis into a reviewable readiness program for affected institutions.
```

- [ ] **Step 6: Keep ratings folder**

Create `calibration-vault/cases/fsd-accident-economy/ratings/.gitkeep` as an empty file.

- [ ] **Step 7: Commit**

Run:

```bash
git add calibration-vault/cases/fsd-accident-economy
git commit -m "feat: seed calibrator vault"
```

Expected: commit succeeds after the standard staged secret scan has been run separately.

## Task 2: Scaffold The Calibrator App

**Files:**
- Create: `calibrator/package.json`
- Create: `calibrator/tsconfig.json`
- Create: `calibrator/vite.config.ts`
- Create: `calibrator/index.html`
- Create: `calibrator/public/.gitkeep`
- Create: `calibrator/src/main.tsx`
- Create: `calibrator/src/App.tsx`
- Create: `calibrator/src/styles.css`

- [ ] **Step 1: Create folders**

Run:

```bash
mkdir -p calibrator/src calibrator/public calibrator/test
```

Expected: command exits 0.

- [ ] **Step 2: Add package config**

Create `calibrator/package.json`:

```json
{
  "name": "doppl-calibrator",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "generate:index": "tsx src/server/generateIndex.ts"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "gray-matter": "^4.0.3",
    "vite": "^6.0.0",
    "zod": "^3.24.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "jsdom": "^25.0.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: Add TypeScript config**

Create `calibrator/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

- [ ] **Step 4: Add Vite config shell**

Create `calibrator/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { createCalibratorDevApi } from "./src/server/devApi";

export default defineConfig({
  plugins: [react(), createCalibratorDevApi()],
  test: {
    environment: "jsdom",
    setupFiles: [],
  },
});
```

- [ ] **Step 5: Add HTML mount**

Create `calibrator/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Doppl Calibrator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Add temporary app**

Create `calibrator/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Create `calibrator/src/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <p className="eyebrow">Doppl Life</p>
      <h1>Calibrator</h1>
      <p>Loading vault index...</p>
    </main>
  );
}
```

Create `calibrator/src/styles.css`:

```css
:root {
  color: #111827;
  background: #f5f7fb;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

button,
input,
textarea,
select {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 48px;
}

.eyebrow {
  color: #0f766e;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

Create `calibrator/public/.gitkeep` as an empty file.

- [ ] **Step 7: Install dependencies**

Run:

```bash
npm install --prefix calibrator
```

Expected: dependencies install and `calibrator/package-lock.json` is created.

- [ ] **Step 8: Run build and observe devApi missing**

Run:

```bash
npm --prefix calibrator run build
```

Expected: FAIL because `./src/server/devApi` does not exist yet.

- [ ] **Step 9: Commit scaffold**

Run:

```bash
git add calibrator/package.json calibrator/package-lock.json calibrator/tsconfig.json calibrator/vite.config.ts calibrator/index.html calibrator/public/.gitkeep calibrator/src/main.tsx calibrator/src/App.tsx calibrator/src/styles.css
git commit -m "feat: scaffold calibrator app"
```

Expected: commit succeeds after the standard staged secret scan has been run separately.

## Task 3: Add Vault Schemas And Rating Writer

**Files:**
- Create: `calibrator/src/server/vaultSchemas.ts`
- Create: `calibrator/src/server/vaultPaths.ts`
- Create: `calibrator/src/server/ratingWriter.ts`
- Create: `calibrator/test/vaultSchemas.test.ts`
- Create: `calibrator/test/ratingWriter.test.ts`

- [ ] **Step 1: Write schema tests**

Create `calibrator/test/vaultSchemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RatingSubmission, SolutionFrontmatter } from "../src/server/vaultSchemas";

describe("vault schemas", () => {
  it("accepts a valid solution frontmatter object", () => {
    expect(
      SolutionFrontmatter.parse({
        artifact_type: "solution",
        case_id: "fsd-accident-economy",
        solution_id: "cody-accident-economy-map",
        title: "Crash Substrate Exposure Map",
        source_type: "kernel",
        kernel: "cody",
        branch: "cody",
        created_at: "2026-06-22T00:00:00.000Z",
      }),
    ).toMatchObject({ solution_id: "cody-accident-economy-map" });
  });

  it("rejects ratings outside the -5 to +5 range", () => {
    expect(() =>
      RatingSubmission.parse({
        case_id: "fsd-accident-economy",
        solution_id: "cody-accident-economy-map",
        score: 6,
        notes: "",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run schema test to verify it fails**

Run:

```bash
npm --prefix calibrator run test -- vaultSchemas
```

Expected: FAIL because `vaultSchemas.ts` does not exist.

- [ ] **Step 3: Implement schemas**

Create `calibrator/src/server/vaultSchemas.ts`:

```ts
import { z } from "zod";

const IsoDateString = z.string().min(1);

export const CaseFrontmatter = z.object({
  artifact_type: z.literal("case"),
  case_id: z.string().min(1),
  title: z.string().min(1),
  source_paths: z.array(z.string().min(1)).default([]),
  visibility: z.string().min(1).default("internal"),
  created_at: IsoDateString.optional(),
});

export const ProblemFrontmatter = z.object({
  artifact_type: z.literal("problem"),
  case_id: z.string().min(1),
  rating_target: z.literal("context_only"),
  source: z.string().min(1),
});

export const SolutionFrontmatter = z.object({
  artifact_type: z.literal("solution"),
  case_id: z.string().min(1),
  solution_id: z.string().min(1),
  title: z.string().min(1),
  source_type: z.enum(["kernel", "manual", "unknown"]),
  kernel: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  generation_id: z.string().min(1).optional(),
  agenome_id: z.string().min(1).optional(),
  candidate_id: z.string().min(1).optional(),
  judge_score: z.number().optional(),
  fitness_score: z.number().optional(),
  created_at: IsoDateString.optional(),
});

export const RatingSubmission = z.object({
  case_id: z.string().min(1),
  solution_id: z.string().min(1),
  score: z.number().int().min(-5).max(5),
  notes: z.string().default(""),
  reviewer_email: z.string().email().optional().or(z.literal("")),
  reviewer_name: z.string().optional(),
});

export const RatingFrontmatter = z.object({
  artifact_type: z.literal("human_rating"),
  rating_id: z.string().min(1),
  rating_target: z.literal("solution"),
  case_id: z.string().min(1),
  solution_id: z.string().min(1),
  score: z.number().int().min(-5).max(5),
  scale_min: z.literal(-5),
  scale_max: z.literal(5),
  reviewer_email: z.string().optional(),
  reviewer_name: z.string().optional(),
  submitted_at: IsoDateString,
  app_version: z.literal("calibrator-v0"),
});

export type CaseFrontmatter = z.infer<typeof CaseFrontmatter>;
export type ProblemFrontmatter = z.infer<typeof ProblemFrontmatter>;
export type SolutionFrontmatter = z.infer<typeof SolutionFrontmatter>;
export type RatingSubmission = z.infer<typeof RatingSubmission>;
export type RatingFrontmatter = z.infer<typeof RatingFrontmatter>;
```

- [ ] **Step 4: Write rating writer tests**

Create `calibrator/test/ratingWriter.test.ts`:

```ts
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { writeRatingMarkdown } from "../src/server/ratingWriter";

describe("writeRatingMarkdown", () => {
  it("writes a rating markdown file under the case ratings folder", async () => {
    const root = join(tmpdir(), `calibrator-${Date.now()}`);
    await mkdir(join(root, "calibration-vault/cases/fsd-accident-economy/ratings"), {
      recursive: true,
    });

    const result = await writeRatingMarkdown({
      vaultRoot: join(root, "calibration-vault"),
      now: new Date("2026-06-22T12:00:00.000Z"),
      submission: {
        case_id: "fsd-accident-economy",
        solution_id: "cody-accident-economy-map",
        score: 4,
        notes: "Strong map of second-order effects.",
        reviewer_email: "reviewer@gauntletai.com",
      },
    });

    const written = await readFile(result.absolutePath, "utf8");
    expect(result.relativePath).toContain("ratings/rating_20260622T120000000Z_");
    expect(written).toContain("artifact_type: human_rating");
    expect(written).toContain("score: 4");
    expect(written).toContain("Strong map of second-order effects.");
  });
});
```

- [ ] **Step 5: Run rating writer test to verify it fails**

Run:

```bash
npm --prefix calibrator run test -- ratingWriter
```

Expected: FAIL because `ratingWriter.ts` does not exist.

- [ ] **Step 6: Implement paths and writer**

Create `calibrator/src/server/vaultPaths.ts`:

```ts
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");
export const defaultVaultRoot = join(repoRoot, "calibration-vault");

export function caseRoot(vaultRoot: string, caseId: string): string {
  return join(vaultRoot, "cases", caseId);
}

export function ratingsRoot(vaultRoot: string, caseId: string): string {
  return join(caseRoot(vaultRoot, caseId), "ratings");
}
```

Create `calibrator/src/server/ratingWriter.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { RatingFrontmatter, RatingSubmission } from "./vaultSchemas";
import { ratingsRoot } from "./vaultPaths";

export interface WriteRatingInput {
  vaultRoot: string;
  submission: RatingSubmission;
  now?: Date;
}

export interface WriteRatingResult {
  ratingId: string;
  absolutePath: string;
  relativePath: string;
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
}

function timestampId(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
}

function toYamlValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function frontmatterYaml(frontmatter: Record<string, unknown>): string {
  return Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${toYamlValue(value)}`)
    .join("\n");
}

export async function writeRatingMarkdown(input: WriteRatingInput): Promise<WriteRatingResult> {
  const submission = RatingSubmission.parse(input.submission);
  const now = input.now ?? new Date();
  const ratingId = `rating_${timestampId(now)}_${safeIdPart(submission.solution_id)}`;
  const frontmatter = RatingFrontmatter.parse({
    artifact_type: "human_rating",
    rating_id: ratingId,
    rating_target: "solution",
    case_id: submission.case_id,
    solution_id: submission.solution_id,
    score: submission.score,
    scale_min: -5,
    scale_max: 5,
    reviewer_email: submission.reviewer_email || undefined,
    reviewer_name: submission.reviewer_name || undefined,
    submitted_at: now.toISOString(),
    app_version: "calibrator-v0",
  });

  const body = [
    "---",
    frontmatterYaml(frontmatter),
    "---",
    "",
    "## Notes",
    "",
    submission.notes.trim() || "No notes provided.",
    "",
    "## Strengths",
    "",
    "## Concerns",
    "",
    "## What Would Improve It",
    "",
  ].join("\n");

  const dir = ratingsRoot(input.vaultRoot, submission.case_id);
  await mkdir(dir, { recursive: true });
  const absolutePath = join(dir, `${ratingId}.md`);
  await writeFile(absolutePath, body, "utf8");

  return {
    ratingId,
    absolutePath,
    relativePath: join("calibration-vault", relative(input.vaultRoot, absolutePath)),
  };
}

export function ratingFileName(path: string): string {
  return basename(path);
}
```

- [ ] **Step 7: Run schema and writer tests**

Run:

```bash
npm --prefix calibrator run test -- vaultSchemas ratingWriter
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add calibrator/src/server/vaultSchemas.ts calibrator/src/server/vaultPaths.ts calibrator/src/server/ratingWriter.ts calibrator/test/vaultSchemas.test.ts calibrator/test/ratingWriter.test.ts
git commit -m "feat: add calibrator vault rating writer"
```

Expected: commit succeeds after the standard staged secret scan has been run separately.

## Task 4: Add Vault Reader And Index Generation

**Files:**
- Create: `calibrator/src/types.ts`
- Create: `calibrator/src/server/vaultReader.ts`
- Create: `calibrator/src/server/generateIndex.ts`
- Create: `calibrator/test/vaultReader.test.ts`

- [ ] **Step 1: Write reader tests**

Create `calibrator/test/vaultReader.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultVaultRoot } from "../src/server/vaultPaths";
import { readVaultIndex } from "../src/server/vaultReader";

describe("readVaultIndex", () => {
  it("loads fsd-accident-economy with two seed solutions", async () => {
    const index = await readVaultIndex(defaultVaultRoot);
    const item = index.cases.find((caseItem) => caseItem.case_id === "fsd-accident-economy");
    expect(item?.title).toBe("When the Crashes Don't Come");
    expect(item?.solutions.map((solution) => solution.solution_id).sort()).toEqual([
      "cody-accident-economy-map",
      "melissa-accident-economy-map",
    ]);
  });
});
```

- [ ] **Step 2: Run reader test to verify it fails**

Run:

```bash
npm --prefix calibrator run test -- vaultReader
```

Expected: FAIL because `vaultReader.ts` does not exist.

- [ ] **Step 3: Add shared types**

Create `calibrator/src/types.ts`:

```ts
export interface CalibratorSolution {
  case_id: string;
  solution_id: string;
  title: string;
  source_type: "kernel" | "manual" | "unknown";
  kernel?: string;
  branch?: string;
  run_id?: string;
  generation_id?: string;
  agenome_id?: string;
  candidate_id?: string;
  judge_score?: number;
  fitness_score?: number;
  created_at?: string;
  body: string;
}

export interface CalibratorCase {
  case_id: string;
  title: string;
  visibility: string;
  source_paths: string[];
  body: string;
  problem: {
    body: string;
    source: string;
  };
  solutions: CalibratorSolution[];
}

export interface CalibratorIndex {
  generated_at: string;
  cases: CalibratorCase[];
}

export interface RatingSubmitResponse {
  ratingId: string;
  relativePath: string;
}
```

- [ ] **Step 4: Implement reader**

Create `calibrator/src/server/vaultReader.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import type { CalibratorCase, CalibratorIndex, CalibratorSolution } from "../types";
import { CaseFrontmatter, ProblemFrontmatter, SolutionFrontmatter } from "./vaultSchemas";

async function readMarkdown(path: string): Promise<{ data: Record<string, unknown>; content: string }> {
  const raw = await readFile(path, "utf8");
  return matter(raw) as { data: Record<string, unknown>; content: string };
}

async function readSolutions(casePath: string): Promise<CalibratorSolution[]> {
  const solutionsPath = join(casePath, "solutions");
  const names = (await readdir(solutionsPath)).filter((name) => name.endsWith(".md")).sort();
  const solutions: CalibratorSolution[] = [];

  for (const name of names) {
    const parsed = await readMarkdown(join(solutionsPath, name));
    const frontmatter = SolutionFrontmatter.parse(parsed.data);
    solutions.push({
      ...frontmatter,
      body: parsed.content.trim(),
    });
  }

  return solutions;
}

export async function readVaultIndex(vaultRoot: string): Promise<CalibratorIndex> {
  const casesRoot = join(vaultRoot, "cases");
  const names = (await readdir(casesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const cases: CalibratorCase[] = [];
  for (const caseId of names) {
    const casePath = join(casesRoot, caseId);
    const caseMarkdown = await readMarkdown(join(casePath, "case.md"));
    const caseFrontmatter = CaseFrontmatter.parse(caseMarkdown.data);
    const problemMarkdown = await readMarkdown(join(casePath, "problem.md"));
    const problemFrontmatter = ProblemFrontmatter.parse(problemMarkdown.data);
    const solutions = await readSolutions(casePath);

    cases.push({
      case_id: caseFrontmatter.case_id,
      title: caseFrontmatter.title,
      visibility: caseFrontmatter.visibility,
      source_paths: caseFrontmatter.source_paths,
      body: caseMarkdown.content.trim(),
      problem: {
        body: problemMarkdown.content.trim(),
        source: problemFrontmatter.source,
      },
      solutions,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    cases,
  };
}
```

- [ ] **Step 5: Add index generator**

Create `calibrator/src/server/generateIndex.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readVaultIndex } from "./vaultReader";
import { defaultVaultRoot, repoRoot } from "./vaultPaths";

const index = await readVaultIndex(defaultVaultRoot);
const outputPath = join(repoRoot, "calibrator/public/calibration-index.json");
await mkdir(join(repoRoot, "calibrator/public"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
```

- [ ] **Step 6: Run tests and index generator**

Run:

```bash
npm --prefix calibrator run test -- vaultReader
npm --prefix calibrator run generate:index
```

Expected: test PASS; generator writes `calibrator/public/calibration-index.json`.

- [ ] **Step 7: Commit**

Run:

```bash
git add calibrator/src/types.ts calibrator/src/server/vaultReader.ts calibrator/src/server/generateIndex.ts calibrator/test/vaultReader.test.ts calibrator/public/calibration-index.json
git commit -m "feat: index calibrator vault"
```

Expected: commit succeeds after the standard staged secret scan has been run separately.

## Task 5: Add Local Dev API

**Files:**
- Create: `calibrator/src/server/devApi.ts`
- Modify: `calibrator/vite.config.ts`

- [ ] **Step 1: Implement dev API plugin**

Create `calibrator/src/server/devApi.ts`:

```ts
import type { Plugin } from "vite";
import { readVaultIndex } from "./vaultReader";
import { defaultVaultRoot } from "./vaultPaths";
import { writeRatingMarkdown } from "./ratingWriter";

async function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export function createCalibratorDevApi(): Plugin {
  return {
    name: "calibrator-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.method === "GET" && req.url === "/api/index") {
            sendJson(res, 200, await readVaultIndex(defaultVaultRoot));
            return;
          }

          if (req.method === "POST" && req.url === "/api/ratings") {
            const body = await readJsonBody(req);
            const result = await writeRatingMarkdown({
              vaultRoot: defaultVaultRoot,
              submission: body,
            });
            sendJson(res, 201, { ratingId: result.ratingId, relativePath: result.relativePath });
            return;
          }
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : "Unknown error" });
          return;
        }

        next();
      });
    },
  };
}
```

- [ ] **Step 2: Run build**

Run:

```bash
npm --prefix calibrator run build
```

Expected: PASS because `devApi.ts` now exists and typechecks.

- [ ] **Step 3: Commit**

Run:

```bash
git add calibrator/src/server/devApi.ts calibrator/vite.config.ts
git commit -m "feat: add calibrator local write api"
```

Expected: commit succeeds after the standard staged secret scan has been run separately.

## Task 6: Build The Review Workbench UI

**Files:**
- Modify: `calibrator/src/App.tsx`
- Modify: `calibrator/src/styles.css`
- Create: `calibrator/test/App.test.tsx`

- [ ] **Step 1: Write UI tests**

Create `calibrator/test/App.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { CalibratorIndex } from "../src/types";

const fixture: CalibratorIndex = {
  generated_at: "2026-06-22T00:00:00.000Z",
  cases: [
    {
      case_id: "fsd-accident-economy",
      title: "When the Crashes Don't Come",
      visibility: "internal",
      source_paths: [],
      body: "# Case body",
      problem: { body: "# Problem body", source: "case-study" },
      solutions: [
        {
          case_id: "fsd-accident-economy",
          solution_id: "cody-accident-economy-map",
          title: "Crash Substrate Exposure Map",
          source_type: "kernel",
          kernel: "cody",
          body: "# Solution body",
        },
      ],
    },
  ],
};

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/index") {
          return new Response(JSON.stringify(fixture), { status: 200 });
        }
        if (url === "/api/ratings" && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              ratingId: "rating_test",
              relativePath: "calibration-vault/cases/fsd-accident-economy/ratings/rating_test.md",
            }),
            { status: 201 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  it("loads the case and disables submit until score is selected", async () => {
    render(<App />);
    expect(await screen.findByText("When the Crashes Don't Come")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit rating" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "+4" }));
    expect(screen.getByRole("button", { name: "Submit rating" })).toBeEnabled();
  });

  it("submits a rating and shows the saved path", async () => {
    render(<App />);
    await screen.findByText("When the Crashes Don't Come");
    await userEvent.click(screen.getByRole("button", { name: "+4" }));
    await userEvent.type(screen.getByLabelText("Notes"), "Useful solution.");
    await userEvent.click(screen.getByRole("button", { name: "Submit rating" }));
    await waitFor(() => {
      expect(screen.getByText(/rating_test.md/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run UI test to verify it fails**

Run:

```bash
npm --prefix calibrator run test -- App
```

Expected: FAIL because current `App.tsx` does not load index or submit ratings.

- [ ] **Step 3: Implement UI**

Replace `calibrator/src/App.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { CalibratorIndex, RatingSubmitResponse } from "./types";

const scores = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

function scoreLabel(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

export function App() {
  const [index, setIndex] = useState<CalibratorIndex | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState("fsd-accident-economy");
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);
  const [caseOpen, setCaseOpen] = useState(true);
  const [solutionOpen, setSolutionOpen] = useState(true);
  const [score, setScore] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/index")
      .then((response) => response.json())
      .then((data: CalibratorIndex) => {
        setIndex(data);
        const firstCase = data.cases[0];
        if (firstCase) {
          setSelectedCaseId(firstCase.case_id);
          setSelectedSolutionId(firstCase.solutions[0]?.solution_id ?? null);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load vault index");
      });
  }, []);

  const selectedCase = useMemo(
    () => index?.cases.find((caseItem) => caseItem.case_id === selectedCaseId) ?? null,
    [index, selectedCaseId],
  );
  const selectedSolution = useMemo(
    () =>
      selectedCase?.solutions.find((solution) => solution.solution_id === selectedSolutionId) ??
      selectedCase?.solutions[0] ??
      null,
    [selectedCase, selectedSolutionId],
  );

  async function submitRating() {
    if (!selectedCase || !selectedSolution || score === null) return;
    setError("");
    setSavedPath("");
    const response = await fetch("/api/ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        case_id: selectedCase.case_id,
        solution_id: selectedSolution.solution_id,
        score,
        notes,
      }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Rating submission failed");
      return;
    }
    const body = (await response.json()) as RatingSubmitResponse;
    setSavedPath(body.relativePath);
    setNotes("");
    setScore(null);
  }

  if (error) {
    return (
      <main className="app-shell">
        <p className="eyebrow">Doppl Life</p>
        <h1>Calibrator</h1>
        <p role="alert" className="error">
          {error}
        </p>
      </main>
    );
  }

  if (!index || !selectedCase) {
    return (
      <main className="app-shell">
        <p className="eyebrow">Doppl Life</p>
        <h1>Calibrator</h1>
        <p>Loading vault index...</p>
      </main>
    );
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <p className="eyebrow">Doppl Life</p>
        <h1>Calibrator</h1>

        <label>
          Case study
          <select
            value={selectedCaseId}
            onChange={(event) => {
              const nextCase = index.cases.find((item) => item.case_id === event.target.value);
              setSelectedCaseId(event.target.value);
              setSelectedSolutionId(nextCase?.solutions[0]?.solution_id ?? null);
              setSavedPath("");
            }}
          >
            {index.cases.map((caseItem) => (
              <option key={caseItem.case_id} value={caseItem.case_id}>
                {caseItem.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          Solution
          <select
            value={selectedSolution?.solution_id ?? ""}
            onChange={(event) => {
              setSelectedSolutionId(event.target.value);
              setSavedPath("");
            }}
          >
            {selectedCase.solutions.map((solution) => (
              <option key={solution.solution_id} value={solution.solution_id}>
                {solution.title}
              </option>
            ))}
          </select>
        </label>

        <div className="meta">
          <strong>{selectedCase.solutions.length}</strong>
          <span>solutions ready for review</span>
        </div>
      </aside>

      <section className="review-pane">
        <header className="case-header">
          <div>
            <p className="eyebrow">Case Study</p>
            <h2>{selectedCase.title}</h2>
            <p>{selectedCase.case_id}</p>
          </div>
          <button type="button" onClick={() => setCaseOpen((value) => !value)}>
            {caseOpen ? "Collapse case" : "Expand case"}
          </button>
        </header>

        {caseOpen && (
          <article className="document">
            <pre>{selectedCase.body}</pre>
            <h3>Problem Context</h3>
            <pre>{selectedCase.problem.body}</pre>
          </article>
        )}

        {selectedSolution && (
          <section className="solution-section">
            <header className="case-header">
              <div>
                <p className="eyebrow">Solution</p>
                <h2>{selectedSolution.title}</h2>
                <p>
                  {selectedSolution.kernel ?? selectedSolution.source_type} /{" "}
                  {selectedSolution.solution_id}
                </p>
              </div>
              <button type="button" onClick={() => setSolutionOpen((value) => !value)}>
                {solutionOpen ? "Collapse solution" : "Expand solution"}
              </button>
            </header>
            {solutionOpen && (
              <article className="document">
                <pre>{selectedSolution.body}</pre>
              </article>
            )}
          </section>
        )}
      </section>

      <aside className="rating-panel">
        <p className="eyebrow">Solution Rating</p>
        <h2>{score === null ? "Select a score" : scoreLabel(score)}</h2>
        <div className="score-grid" aria-label="Score">
          {scores.map((value) => (
            <button
              key={value}
              type="button"
              className={score === value ? "selected" : ""}
              onClick={() => setScore(value)}
            >
              {scoreLabel(value)}
            </button>
          ))}
        </div>
        <label>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={8} />
        </label>
        <button className="submit" type="button" disabled={score === null} onClick={submitRating}>
          Submit rating
        </button>
        {savedPath && <p className="saved">Saved to {savedPath}</p>}
      </aside>
    </main>
  );
}
```

- [ ] **Step 4: Implement CSS**

Replace `calibrator/src/styles.css`:

```css
:root {
  color: #111827;
  background: #f5f7fb;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input,
textarea,
select {
  font: inherit;
}

button,
select,
textarea {
  border: 1px solid #cbd5e1;
}

button {
  cursor: pointer;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  line-height: 1.6;
}

.app-shell,
.workspace {
  min-height: 100vh;
}

.app-shell {
  padding: 48px;
}

.workspace {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  gap: 20px;
  padding: 24px;
}

.sidebar,
.review-pane,
.rating-panel {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
}

.sidebar,
.rating-panel {
  align-self: start;
  display: grid;
  gap: 18px;
  padding: 20px;
  position: sticky;
  top: 24px;
}

.review-pane {
  display: grid;
  gap: 18px;
  padding: 24px;
}

.eyebrow {
  color: #0f766e;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  margin: 0 0 6px;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  font-size: 34px;
  line-height: 1;
}

h2 {
  font-size: 24px;
  line-height: 1.15;
}

label {
  color: #475569;
  display: grid;
  font-size: 13px;
  font-weight: 700;
  gap: 8px;
}

select,
textarea {
  border-radius: 6px;
  color: #111827;
  padding: 10px;
  width: 100%;
}

.case-header {
  align-items: start;
  border-bottom: 1px solid #d9e2ec;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding-bottom: 16px;
}

.case-header button,
.score-grid button {
  background: #f8fafc;
  border-radius: 6px;
  color: #111827;
  padding: 9px 12px;
}

.document {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 18px;
}

.solution-section {
  display: grid;
  gap: 18px;
}

.score-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, 1fr);
}

.score-grid .selected,
.submit {
  background: #0f766e;
  border-color: #0f766e;
  color: #ffffff;
}

.submit {
  border-radius: 6px;
  font-weight: 800;
  padding: 12px;
}

.submit:disabled {
  background: #94a3b8;
  border-color: #94a3b8;
  cursor: not-allowed;
}

.meta,
.saved {
  background: #ecfeff;
  border: 1px solid #99f6e4;
  border-radius: 8px;
  padding: 12px;
}

.meta strong {
  display: block;
  font-size: 28px;
}

.meta span,
.saved {
  color: #475569;
}

.error {
  color: #b91c1c;
}

@media (max-width: 1000px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .sidebar,
  .rating-panel {
    position: static;
  }
}
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm --prefix calibrator run test -- App
npm --prefix calibrator run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add calibrator/src/App.tsx calibrator/src/styles.css calibrator/test/App.test.tsx
git commit -m "feat: build calibrator review workbench"
```

Expected: commit succeeds after the standard staged secret scan has been run separately.

## Task 7: Verify Locally In Browser

**Files:**
- No source changes expected.

- [ ] **Step 1: Run full checks**

Run:

```bash
npm --prefix calibrator run test
npm --prefix calibrator run build
```

Expected: all tests PASS; build PASS.

- [ ] **Step 2: Start dev server**

Run:

```bash
npm --prefix calibrator run dev -- --port 5177
```

Expected: Vite serves at `http://127.0.0.1:5177/`.

- [ ] **Step 3: Manual browser check**

Open `http://127.0.0.1:5177/` and verify:

- Case selector shows `When the Crashes Don't Come`.
- Solution selector shows both seed solutions.
- Case details collapse and expand.
- Solution details collapse and expand.
- Submit is disabled before score selection.
- Selecting `+4`, adding notes, and submitting creates a new markdown file under `calibration-vault/cases/fsd-accident-economy/ratings/`.
- Saved path appears in the UI.

- [ ] **Step 4: Check generated rating**

Run:

```bash
ls calibration-vault/cases/fsd-accident-economy/ratings
```

Expected: at least one generated `rating_*.md` file appears after manual submission. Do not commit real reviewer ratings unless intentionally creating a fixture.

## Task 8: Final Commit Hygiene And README

**Files:**
- Create: `calibrator/README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Ignore generated local ratings by default**

Modify `.gitignore` by adding:

```gitignore
# Calibrator local reviewer submissions are vault truth, but local manual test
# submissions should be intentionally staged rather than accidentally committed.
calibration-vault/cases/*/ratings/rating_*.md
```

- [ ] **Step 2: Add README**

Create `calibrator/README.md`:

```markdown
# Doppl Calibrator

Calibrator is a local review workbench for rating Doppl solution artifacts. The markdown vault is the source of truth; the app reads case and solution markdown, then writes human rating markdown into `calibration-vault/`.

## Run Locally

```bash
npm install --prefix calibrator
npm --prefix calibrator run dev -- --port 5177
```

Open `http://127.0.0.1:5177/`.

## Checks

```bash
npm --prefix calibrator run test
npm --prefix calibrator run build
```

## Vault

Seed artifacts live under:

```text
calibration-vault/cases/fsd-accident-economy/
```

Rating submissions are written as markdown under each case's `ratings/` folder.
```

- [ ] **Step 3: Run final checks**

Run:

```bash
npm --prefix calibrator run test
npm --prefix calibrator run build
git status --short
```

Expected: tests/build PASS; only planned README/gitignore changes and intentional generated files are present.

- [ ] **Step 4: Commit docs and ignore**

Run:

```bash
git add .gitignore calibrator/README.md
git commit -m "docs: document calibrator local workflow"
```

Expected: commit succeeds after the standard staged secret scan has been run separately.

## Self-Review Checklist

- Spec coverage: the plan covers vault seed artifacts, solution-only rating, local web UI, collapsible case/solution details, direct markdown rating persistence, hosted/auth-ready schema fields, provenance fields, validation, tests, and local verification.
- Known deferrals: auth, hosted API, database indexes, problem-recovery scoring, and live kernel export ingestion remain deferred by design.
- Placeholder scan: no unfinished markers or unspecified implementation steps should remain.
- Type consistency: `case_id`, `solution_id`, `rating_id`, `rating_target`, `score`, `reviewer_email`, and `relativePath` are used consistently across schemas, writer, API, UI, and tests.
