# Dalton Kernel Synthesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic full Doppl kernel loop on `dalton` that emits trace JSON and calibrator-compatible markdown artifacts from a case study.

**Architecture:** Add a small dependency-light TypeScript kernel under `kernel/`, runnable with Node's `--experimental-strip-types`. The first implementation is fixture mode: one canonical `KernelRun` object owns facts, tests verify the loop, and export files project from the run instead of inventing separate state.

**Tech Stack:** Node.js ES modules, TypeScript syntax stripped by Node, `node:test`, `node:assert/strict`, plain JSON/Markdown fixtures, no provider SDKs.

---

## File Structure

- Create `package.json`: root scripts for test, kernel run, and build-free verification.
- Create `kernel/package.json`: package metadata for the kernel workspace.
- Create `kernel/src/contracts.ts`: all runtime types, assertion helpers, score helpers, and event factory types.
- Create `kernel/src/case-loader.ts`: markdown case loader and frontmatter-lite parser.
- Create `kernel/src/knowledge-gateway.ts`: `KnowledgeGateway` port, fixture adapter, and replay adapter.
- Create `kernel/src/fixtures.ts`: deterministic fixture agenomes, recovery templates, candidate templates, critic verdicts, and knowledge packets.
- Create `kernel/src/scoring.ts`: critic aggregation, fitness scoring, parent selection, compatibility, and inheritance weights.
- Create `kernel/src/fusion.ts`: child artifact synthesis using weighted inheritance.
- Create `kernel/src/vault-export.ts`: markdown-vault export writer and manifest builder.
- Create `kernel/src/run-kernel.ts`: orchestrates the end-to-end kernel loop and owns event order.
- Create `kernel/src/cli.ts`: command-line runner that writes run artifacts.
- Create `kernel/test/*.test.ts`: focused Node tests for each behavior-bearing module.
- Create `kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json`: fixture packet for memory injection.
- Create `kernel/fixtures/fsd-ownership-unwind/run-fixture.json`: fixture run data for deterministic recovery, candidates, and critics.
- Write generated outputs under `kernel/out/` and ignore them in `.gitignore`.

## Task 1: Scaffold Runnable Kernel Package

**Files:**
- Create: `package.json`
- Create: `kernel/package.json`
- Modify: `.gitignore`
- Create: `kernel/test/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

Create `kernel/test/smoke.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('kernel test harness is wired', () => {
  assert.equal('doppl-kernel'.includes('kernel'), true);
});
```

- [ ] **Step 2: Add root scripts**

Create `package.json`:

```json
{
  "name": "doppl-prime",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --experimental-strip-types --test kernel/test/*.test.ts",
    "kernel:run": "node --experimental-strip-types kernel/src/cli.ts"
  },
  "engines": {
    "node": ">=22"
  }
}
```

- [ ] **Step 3: Add kernel package metadata**

Create `kernel/package.json`:

```json
{
  "name": "@doppl/kernel",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 4: Ignore generated outputs**

Append to `.gitignore`:

```gitignore

# Dalton kernel generated artifacts
kernel/out/
```

- [ ] **Step 5: Run smoke test**

Run: `npm test`

Expected: one passing test file with `# pass 1`.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json kernel/package.json kernel/test/smoke.test.ts .gitignore
git commit -m "feat: scaffold dalton kernel package"
```

## Task 2: Define Kernel Contracts

**Files:**
- Create: `kernel/src/contracts.ts`
- Create: `kernel/test/contracts.test.ts`

- [ ] **Step 1: Write contract tests**

Create `kernel/test/contracts.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInheritanceWeights, assertKernelRun } from '../src/contracts.ts';

test('inheritance weights preserve a 2:1 parent fitness ratio', () => {
  assert.deepEqual(calculateInheritanceWeights(80, 40), { parentA: 0.667, parentB: 0.333 });
});

test('kernel run assertion rejects missing problem recovery', () => {
  assert.throws(() => assertKernelRun({ id: 'run_bad' }), /problemRecovery/);
});
```

- [ ] **Step 2: Implement focused runtime types and assertions**

Create `kernel/src/contracts.ts` with these exported types and helpers:

```ts
export type MemoryMode = 'off' | 'auto' | 'pinned';

export type CaseStudy = {
  id: string;
  title: string;
  sourcePath: string;
  markdown: string;
  statedProblem: string;
};

export type KnowledgePacketItem = {
  recordId: string;
  citeHandle: string;
  text: string;
  sourceCase: string;
  citation: string;
  trustTier: string;
  visibility: string;
};

export type KnowledgePacket = {
  id: string;
  targetCase: string;
  items: KnowledgePacketItem[];
  excluded: Array<{ reason: string; case?: string; recordId?: string }>;
};

export type ProblemRecovery = {
  id: string;
  caseId: string;
  title: string;
  recoveredProblem: string;
  hiddenConstraint: string;
  falsifier: string;
  citedKnowledge: string[];
};

export type CandidateSolution = {
  id: string;
  caseId: string;
  agenomeId: string;
  generation: number;
  title: string;
  summary: string;
  mechanism: string;
  claimedDelta: string;
  citedKnowledge: string[];
};

export type CriticVerdict = {
  candidateId: string;
  criticId: string;
  score: number;
  pressure: string;
  revisionMandate: string;
};

export type FitnessRecord = {
  candidateId: string;
  total: number;
  components: {
    novelty: number;
    grounding: number;
    mechanismClarity: number;
    mechanismCost: number;
    criticPressure: number;
    evidenceQuality: number;
  };
  rationale: string;
};

export type PairCompatibility = {
  parentA: string;
  parentB: string;
  score: number;
  rationale: string;
};

export type InheritanceWeights = {
  parentA: number;
  parentB: number;
};

export type FusionResult = {
  child: CandidateSolution;
  parentCandidateIds: [string, string];
  compatibility: PairCompatibility;
  inheritanceWeights: InheritanceWeights;
  inheritedTraits: string[];
  mutationNotes: string[];
};

export type RunEvent = {
  index: number;
  type: string;
  payload: Record<string, unknown>;
};

export type VaultExportManifest = {
  rootDir: string;
  files: string[];
};

export type KernelRun = {
  id: string;
  caseStudy: CaseStudy;
  memoryMode: MemoryMode;
  knowledgePacket: KnowledgePacket;
  problemRecovery: ProblemRecovery;
  candidates: CandidateSolution[];
  criticVerdicts: CriticVerdict[];
  fitnessRecords: FitnessRecord[];
  selectedParents: [CandidateSolution, CandidateSolution] | [];
  fusion?: FusionResult;
  events: RunEvent[];
  vaultExport?: VaultExportManifest;
};

export function calculateInheritanceWeights(parentAScore: number, parentBScore: number): InheritanceWeights {
  const safeA = Math.max(parentAScore, 0);
  const safeB = Math.max(parentBScore, 0);
  const total = safeA + safeB;
  if (total === 0) return { parentA: 0.5, parentB: 0.5 };
  return {
    parentA: Number((safeA / total).toFixed(3)),
    parentB: Number((safeB / total).toFixed(3)),
  };
}

export function assertKernelRun(value: unknown): KernelRun {
  const run = value as Partial<KernelRun>;
  if (!run || typeof run !== 'object') throw new Error('KernelRun must be an object');
  if (!run.id) throw new Error('KernelRun.id is required');
  if (!run.caseStudy) throw new Error('KernelRun.caseStudy is required');
  if (!run.problemRecovery) throw new Error('KernelRun.problemRecovery is required');
  if (!Array.isArray(run.events)) throw new Error('KernelRun.events is required');
  return run as KernelRun;
}
```

- [ ] **Step 3: Run contract tests**

Run: `npm test`

Expected: contract tests pass, including the `80` vs `40` inheritance assertion.

- [ ] **Step 4: Commit**

Run:

```bash
git add kernel/src/contracts.ts kernel/test/contracts.test.ts
git commit -m "feat: define dalton kernel contracts"
```

## Task 3: Load Case Markdown And Fixture Data

**Files:**
- Create: `kernel/src/case-loader.ts`
- Create: `kernel/src/fixtures.ts`
- Create: `kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json`
- Create: `kernel/fixtures/fsd-ownership-unwind/run-fixture.json`
- Create: `kernel/test/fixtures.test.ts`

- [ ] **Step 1: Write fixture loading tests**

Create `kernel/test/fixtures.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCaseStudy } from '../src/case-loader.ts';
import { loadKernelFixture } from '../src/fixtures.ts';

test('loads a markdown case study with a stable id and title', async () => {
  const caseStudy = await loadCaseStudy('case-studies/fsd-ownership-unwind/problem-statement.md');
  assert.equal(caseStudy.id, 'fsd-ownership-unwind');
  assert.match(caseStudy.title, /FSD|ownership|unwind/i);
  assert.match(caseStudy.statedProblem, /./);
});

test('loads deterministic run fixture data', async () => {
  const fixture = await loadKernelFixture('kernel/fixtures/fsd-ownership-unwind/run-fixture.json');
  assert.equal(fixture.caseId, 'fsd-ownership-unwind');
  assert.equal(fixture.candidates.length, 3);
  assert.equal(fixture.critics.length, 3);
});
```

- [ ] **Step 2: Implement markdown case loading**

Create `kernel/src/case-loader.ts`:

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaseStudy } from './contracts.ts';

function titleFromMarkdown(markdown: string, fallback: string): string {
  const heading = markdown.split('\n').find((line) => line.startsWith('# '));
  return heading ? heading.replace(/^#\s+/, '').trim() : fallback;
}

export async function loadCaseStudy(sourcePath: string): Promise<CaseStudy> {
  const markdown = await readFile(sourcePath, 'utf8');
  const id = path.basename(path.dirname(sourcePath));
  const title = titleFromMarkdown(markdown, id);
  const statedProblem = markdown
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.startsWith('#'))
    .slice(0, 8)
    .join('\n');
  if (!statedProblem) throw new Error(`case study has no stated problem: ${sourcePath}`);
  return { id, title, sourcePath, markdown, statedProblem };
}
```

- [ ] **Step 3: Implement deterministic fixture loader**

Create `kernel/src/fixtures.ts`:

```ts
import { readFile } from 'node:fs/promises';
import type { CandidateSolution, CriticVerdict, ProblemRecovery } from './contracts.ts';

export type KernelFixture = {
  caseId: string;
  problemRecovery: Omit<ProblemRecovery, 'id' | 'caseId'>;
  candidates: Array<Omit<CandidateSolution, 'caseId' | 'generation'>>;
  critics: CriticVerdict[];
};

export async function loadKernelFixture(filePath: string): Promise<KernelFixture> {
  const fixture = JSON.parse(await readFile(filePath, 'utf8')) as KernelFixture;
  if (!fixture.caseId) throw new Error('fixture.caseId is required');
  if (!fixture.problemRecovery) throw new Error('fixture.problemRecovery is required');
  if (!Array.isArray(fixture.candidates) || fixture.candidates.length < 2) {
    throw new Error('fixture.candidates must contain at least two candidates');
  }
  if (!Array.isArray(fixture.critics) || fixture.critics.length === 0) {
    throw new Error('fixture.critics must contain critic verdicts');
  }
  return fixture;
}
```

- [ ] **Step 4: Add fixture JSON files**

Create `kernel/fixtures/fsd-ownership-unwind/run-fixture.json` with three candidate solution fixtures and three critic verdicts per candidate. Use candidate IDs `cand_recovery_market`, `cand_liability_clock`, and `cand_lender_residual`, with `cand_liability_clock` scored highest by critics.

Create `kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json` with two cited packet items about residual-value pressure and insurance/liability timing, plus one excluded target-case item.

- [ ] **Step 5: Run fixture tests**

Run: `npm test`

Expected: fixture tests pass and the case loader reads the existing FSD case study.

- [ ] **Step 6: Commit**

Run:

```bash
git add kernel/src/case-loader.ts kernel/src/fixtures.ts kernel/fixtures/fsd-ownership-unwind kernel/test/fixtures.test.ts
git commit -m "feat: load kernel case and fixture data"
```

## Task 4: Add Knowledge Gateway With Replay

**Files:**
- Create: `kernel/src/knowledge-gateway.ts`
- Create: `kernel/test/knowledge-gateway.test.ts`

- [ ] **Step 1: Write knowledge gateway tests**

Create `kernel/test/knowledge-gateway.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJsonKnowledgeGateway, createReplayKnowledgeGateway } from '../src/knowledge-gateway.ts';

test('json gateway selects a packet for the target case', async () => {
  const gateway = await createJsonKnowledgeGateway('kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json');
  const packet = await gateway.selectPacket({ runId: 'run_1', targetCase: 'fsd-ownership-unwind', maxItems: 1 });
  assert.equal(packet.items.length, 1);
  assert.equal(packet.items[0]?.citeHandle, 'K1');
});

test('replay gateway returns the persisted packet without fresh retrieval', async () => {
  const live = await createJsonKnowledgeGateway('kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json');
  const packet = await live.selectPacket({ runId: 'run_1', targetCase: 'fsd-ownership-unwind', maxItems: 2 });
  const replay = createReplayKnowledgeGateway(packet);
  const replayed = await replay.selectPacket({ runId: 'run_2', targetCase: 'fsd-ownership-unwind', maxItems: 2 });
  assert.equal(replayed.id, packet.id);
  assert.equal(replay.freshRetrievals(), 0);
});
```

- [ ] **Step 2: Implement gateway port and adapters**

Create `kernel/src/knowledge-gateway.ts`:

```ts
import { readFile } from 'node:fs/promises';
import type { KnowledgePacket } from './contracts.ts';

export type KnowledgePacketRequest = {
  runId: string;
  targetCase: string;
  maxItems: number;
};

export type KnowledgeGateway = {
  selectPacket(request: KnowledgePacketRequest): Promise<KnowledgePacket>;
};

export async function createJsonKnowledgeGateway(packetFile: string): Promise<KnowledgeGateway> {
  const packet = JSON.parse(await readFile(packetFile, 'utf8')) as KnowledgePacket;
  return {
    async selectPacket(request) {
      return {
        ...packet,
        id: packet.id || `packet:${request.runId}:${request.targetCase}`,
        targetCase: request.targetCase,
        items: packet.items.slice(0, request.maxItems),
      };
    },
  };
}

export function createReplayKnowledgeGateway(packet: KnowledgePacket): KnowledgeGateway & { freshRetrievals(): number } {
  return {
    async selectPacket() {
      return packet;
    },
    freshRetrievals() {
      return 0;
    },
  };
}
```

- [ ] **Step 3: Run knowledge tests**

Run: `npm test`

Expected: packet selection and replay tests pass.

- [ ] **Step 4: Commit**

Run:

```bash
git add kernel/src/knowledge-gateway.ts kernel/test/knowledge-gateway.test.ts
git commit -m "feat: add kernel knowledge gateway"
```

## Task 5: Implement Scoring, Selection, And Fusion

**Files:**
- Create: `kernel/src/scoring.ts`
- Create: `kernel/src/fusion.ts`
- Create: `kernel/test/scoring.test.ts`
- Create: `kernel/test/fusion.test.ts`

- [ ] **Step 1: Write scoring tests**

Create `kernel/test/scoring.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidates, selectParents, checkPairCompatibility } from '../src/scoring.ts';

test('scores candidates and selects parents individually before compatibility', () => {
  const records = scoreCandidates([
    { candidateId: 'a', criticId: 'critic', score: 80, pressure: 'good', revisionMandate: 'tighten' },
    { candidateId: 'b', criticId: 'critic', score: 40, pressure: 'thin', revisionMandate: 'ground' },
    { candidateId: 'c', criticId: 'critic', score: 20, pressure: 'weak', revisionMandate: 'rewrite' }
  ]);
  assert.equal(records[0]?.candidateId, 'a');
  assert.equal(records[1]?.candidateId, 'b');
  assert.deepEqual(selectParents(records), ['a', 'b']);
});

test('compatibility is separate from fitness', () => {
  const compatibility = checkPairCompatibility('a', 'b');
  assert.equal(compatibility.parentA, 'a');
  assert.equal(compatibility.parentB, 'b');
  assert.ok(compatibility.score > 0);
});
```

- [ ] **Step 2: Implement scoring and selection**

Create `kernel/src/scoring.ts`:

```ts
import type { CriticVerdict, FitnessRecord, PairCompatibility } from './contracts.ts';

export function scoreCandidates(verdicts: CriticVerdict[]): FitnessRecord[] {
  const byCandidate = new Map<string, CriticVerdict[]>();
  for (const verdict of verdicts) {
    byCandidate.set(verdict.candidateId, [...(byCandidate.get(verdict.candidateId) || []), verdict]);
  }
  return [...byCandidate.entries()]
    .map(([candidateId, rows]) => {
      const average = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
      const total = Number(average.toFixed(1));
      return {
        candidateId,
        total,
        components: {
          novelty: total,
          grounding: total,
          mechanismClarity: total,
          mechanismCost: Number((100 - total * 0.35).toFixed(1)),
          criticPressure: total,
          evidenceQuality: total,
        },
        rationale: rows.map((row) => row.pressure).join(' | '),
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function selectParents(records: FitnessRecord[]): [string, string] | [] {
  if (records.length < 2) return [];
  return [records[0]!.candidateId, records[1]!.candidateId];
}

export function checkPairCompatibility(parentA: string, parentB: string): PairCompatibility {
  return {
    parentA,
    parentB,
    score: parentA === parentB ? 0 : 76,
    rationale: 'Parents preserve distinct mechanisms while sharing enough case grounding to fuse.',
  };
}
```

- [ ] **Step 3: Write fusion test**

Create `kernel/test/fusion.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { fuseCandidates } from '../src/fusion.ts';

test('fuses candidates with weighted inheritance metadata', () => {
  const fusion = fuseCandidates({
    caseId: 'case',
    parentA: { id: 'a', caseId: 'case', agenomeId: 'ag_a', generation: 0, title: 'A', summary: 'A summary', mechanism: 'A mechanism', claimedDelta: 'A delta', citedKnowledge: ['K1'] },
    parentB: { id: 'b', caseId: 'case', agenomeId: 'ag_b', generation: 0, title: 'B', summary: 'B summary', mechanism: 'B mechanism', claimedDelta: 'B delta', citedKnowledge: ['K2'] },
    parentAScore: 80,
    parentBScore: 40,
    compatibility: { parentA: 'a', parentB: 'b', score: 76, rationale: 'compatible' }
  });
  assert.equal(fusion.child.generation, 1);
  assert.deepEqual(fusion.inheritanceWeights, { parentA: 0.667, parentB: 0.333 });
  assert.deepEqual(fusion.parentCandidateIds, ['a', 'b']);
});
```

- [ ] **Step 4: Implement fusion**

Create `kernel/src/fusion.ts`:

```ts
import { calculateInheritanceWeights, type CandidateSolution, type FusionResult, type PairCompatibility } from './contracts.ts';

export function fuseCandidates(input: {
  caseId: string;
  parentA: CandidateSolution;
  parentB: CandidateSolution;
  parentAScore: number;
  parentBScore: number;
  compatibility: PairCompatibility;
}): FusionResult {
  const inheritanceWeights = calculateInheritanceWeights(input.parentAScore, input.parentBScore);
  const child: CandidateSolution = {
    id: `child_${input.parentA.id}_${input.parentB.id}`,
    caseId: input.caseId,
    agenomeId: `fused_${input.parentA.agenomeId}_${input.parentB.agenomeId}`,
    generation: Math.max(input.parentA.generation, input.parentB.generation) + 1,
    title: `${input.parentA.title} / ${input.parentB.title} fusion`,
    summary: `${input.parentA.summary} The child imports the secondary constraint from ${input.parentB.title}.`,
    mechanism: `${input.parentA.mechanism} It is tempered by ${input.parentB.mechanism}`,
    claimedDelta: `${input.parentA.claimedDelta} + ${input.parentB.claimedDelta}`,
    citedKnowledge: [...new Set([...input.parentA.citedKnowledge, ...input.parentB.citedKnowledge])],
  };
  return {
    child,
    parentCandidateIds: [input.parentA.id, input.parentB.id],
    compatibility: input.compatibility,
    inheritanceWeights,
    inheritedTraits: [
      `${input.parentA.id}: primary mechanism at ${inheritanceWeights.parentA}`,
      `${input.parentB.id}: constraint and failure-mode pressure at ${inheritanceWeights.parentB}`,
    ],
    mutationNotes: ['Combined mechanisms only after separate parent scoring and compatibility check.'],
  };
}
```

- [ ] **Step 5: Run scoring and fusion tests**

Run: `npm test`

Expected: scoring, parent selection, compatibility, and weighted fusion tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add kernel/src/scoring.ts kernel/src/fusion.ts kernel/test/scoring.test.ts kernel/test/fusion.test.ts
git commit -m "feat: score and fuse kernel candidates"
```

## Task 6: Orchestrate Kernel Run And Vault Export

**Files:**
- Create: `kernel/src/run-kernel.ts`
- Create: `kernel/src/vault-export.ts`
- Create: `kernel/test/run-kernel.test.ts`
- Create: `kernel/test/vault-export.test.ts`

- [ ] **Step 1: Write end-to-end kernel test**

Create `kernel/test/run-kernel.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { runKernel } from '../src/run-kernel.ts';

test('runs deterministic kernel loop end to end', async () => {
  const run = await runKernel({
    runId: 'run_test',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto'
  });
  assert.equal(run.problemRecovery.caseId, 'fsd-ownership-unwind');
  assert.equal(run.candidates.length, 3);
  assert.equal(run.selectedParents.length, 2);
  assert.equal(run.fusion?.inheritanceWeights.parentA, 0.667);
  assert.ok(run.events.some((event) => event.type === 'knowledge.packet_selected'));
});
```

- [ ] **Step 2: Implement kernel orchestrator**

Create `kernel/src/run-kernel.ts`:

```ts
import type { KernelRun, MemoryMode, RunEvent } from './contracts.ts';
import { loadCaseStudy } from './case-loader.ts';
import { createJsonKnowledgeGateway } from './knowledge-gateway.ts';
import { loadKernelFixture } from './fixtures.ts';
import { scoreCandidates, selectParents, checkPairCompatibility } from './scoring.ts';
import { fuseCandidates } from './fusion.ts';

function eventFactory() {
  const events: RunEvent[] = [];
  return {
    events,
    push(type: string, payload: Record<string, unknown>) {
      events.push({ index: events.length, type, payload });
    },
  };
}

export async function runKernel(input: {
  runId: string;
  casePath: string;
  fixturePath: string;
  knowledgePacketPath: string;
  memoryMode: MemoryMode;
}): Promise<KernelRun> {
  const trace = eventFactory();
  const caseStudy = await loadCaseStudy(input.casePath);
  trace.push('run.started', { runId: input.runId, caseId: caseStudy.id });
  trace.push('knowledge.packet_requested', { targetCase: caseStudy.id, memoryMode: input.memoryMode });
  const gateway = await createJsonKnowledgeGateway(input.knowledgePacketPath);
  const knowledgePacket = await gateway.selectPacket({ runId: input.runId, targetCase: caseStudy.id, maxItems: 4 });
  trace.push('knowledge.packet_selected', { packetId: knowledgePacket.id, items: knowledgePacket.items.length });
  for (const item of knowledgePacket.items) {
    trace.push('knowledge.item_injected', { citeHandle: item.citeHandle, recipientRole: 'problem_recovery' });
  }

  const fixture = await loadKernelFixture(input.fixturePath);
  const problemRecovery = {
    id: `recovery_${caseStudy.id}`,
    caseId: caseStudy.id,
    ...fixture.problemRecovery,
    citedKnowledge: knowledgePacket.items.map((item) => item.citeHandle),
  };
  trace.push('problem_recovery.created', { recoveryId: problemRecovery.id });

  const candidates = fixture.candidates.map((candidate) => ({
    ...candidate,
    caseId: caseStudy.id,
    generation: 0,
  }));
  for (const candidate of candidates) trace.push('candidate.created', { candidateId: candidate.id, agenomeId: candidate.agenomeId });

  const criticVerdicts = fixture.critics;
  for (const verdict of criticVerdicts) trace.push('critic.verdict_recorded', { candidateId: verdict.candidateId, criticId: verdict.criticId, score: verdict.score });

  const fitnessRecords = scoreCandidates(criticVerdicts);
  for (const fitness of fitnessRecords) trace.push('fitness.scored', { candidateId: fitness.candidateId, total: fitness.total });

  const selectedIds = selectParents(fitnessRecords);
  const selectedParents = selectedIds.length === 2
    ? selectedIds.map((id) => candidates.find((candidate) => candidate.id === id)!).slice(0, 2) as [typeof candidates[number], typeof candidates[number]]
    : [];
  let fusion;
  if (selectedParents.length === 2) {
    const compatibility = checkPairCompatibility(selectedParents[0].id, selectedParents[1].id);
    trace.push('pair.compatibility_checked', { ...compatibility });
    fusion = fuseCandidates({
      caseId: caseStudy.id,
      parentA: selectedParents[0],
      parentB: selectedParents[1],
      parentAScore: fitnessRecords.find((record) => record.candidateId === selectedParents[0].id)!.total,
      parentBScore: fitnessRecords.find((record) => record.candidateId === selectedParents[1].id)!.total,
      compatibility,
    });
    trace.push('candidate.fused', { childId: fusion.child.id, inheritanceWeights: fusion.inheritanceWeights });
  }
  trace.push('run.completed', { runId: input.runId, childId: fusion?.child.id || null });

  return {
    id: input.runId,
    caseStudy,
    memoryMode: input.memoryMode,
    knowledgePacket,
    problemRecovery,
    candidates,
    criticVerdicts,
    fitnessRecords,
    selectedParents,
    fusion,
    events: trace.events,
  };
}
```

- [ ] **Step 3: Write vault export test**

Create `kernel/test/vault-export.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runKernel } from '../src/run-kernel.ts';
import { exportRunToVault } from '../src/vault-export.ts';

test('exports problem recovery and child solution markdown separately', async () => {
  const run = await runKernel({
    runId: 'run_export',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto'
  });
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-'));
  const manifest = await exportRunToVault(run, outDir);
  assert.ok(manifest.files.some((file) => file.endsWith('problem-recovery.md')));
  assert.ok(manifest.files.some((file) => file.includes('child_')));
  const recovery = await readFile(manifest.files.find((file) => file.endsWith('problem-recovery.md'))!, 'utf8');
  assert.match(recovery, /artifact_type: problem_recovery/);
});
```

- [ ] **Step 4: Implement vault export**

Create `kernel/src/vault-export.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CandidateSolution, KernelRun, VaultExportManifest } from './contracts.ts';

function frontmatter(fields: Record<string, string>): string {
  return ['---', ...Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`), '---', ''].join('\n');
}

function solutionMarkdown(solution: CandidateSolution): string {
  return `${frontmatter({ artifact_type: 'solution', artifact_id: solution.id, case_id: solution.caseId, agenome_id: solution.agenomeId })}
# ${solution.title}

${solution.summary}

## Mechanism

${solution.mechanism}

## Claimed Delta

${solution.claimedDelta}

## Knowledge Citations

${solution.citedKnowledge.join(', ') || 'none'}
`;
}

export async function exportRunToVault(run: KernelRun, rootDir: string): Promise<VaultExportManifest> {
  const runDir = path.join(rootDir, run.caseStudy.id, run.id);
  await mkdir(runDir, { recursive: true });
  const files: string[] = [];
  const recoveryPath = path.join(runDir, 'problem-recovery.md');
  await writeFile(recoveryPath, `${frontmatter({ artifact_type: 'problem_recovery', artifact_id: run.problemRecovery.id, case_id: run.caseStudy.id })}
# ${run.problemRecovery.title}

${run.problemRecovery.recoveredProblem}

## Hidden Constraint

${run.problemRecovery.hiddenConstraint}

## Falsifier

${run.problemRecovery.falsifier}

## Knowledge Citations

${run.problemRecovery.citedKnowledge.join(', ') || 'none'}
`, 'utf8');
  files.push(recoveryPath);

  for (const solution of [...run.candidates, ...(run.fusion ? [run.fusion.child] : [])]) {
    const solutionPath = path.join(runDir, `${solution.id}.md`);
    await writeFile(solutionPath, solutionMarkdown(solution), 'utf8');
    files.push(solutionPath);
  }

  const tracePath = path.join(runDir, 'trace.json');
  await writeFile(tracePath, JSON.stringify(run, null, 2), 'utf8');
  files.push(tracePath);
  return { rootDir: runDir, files };
}
```

- [ ] **Step 5: Run kernel and export tests**

Run: `npm test`

Expected: end-to-end run and vault export tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add kernel/src/run-kernel.ts kernel/src/vault-export.ts kernel/test/run-kernel.test.ts kernel/test/vault-export.test.ts
git commit -m "feat: run and export deterministic kernel"
```

## Task 7: Add CLI Proof Run

**Files:**
- Create: `kernel/src/cli.ts`
- Create: `kernel/test/cli.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write CLI behavior test**

Create `kernel/test/cli.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultKernelArgs } from '../src/cli.ts';

test('default CLI args point at the FSD fixture', () => {
  assert.equal(defaultKernelArgs.casePath, 'case-studies/fsd-ownership-unwind/problem-statement.md');
  assert.equal(defaultKernelArgs.memoryMode, 'auto');
});
```

- [ ] **Step 2: Implement CLI**

Create `kernel/src/cli.ts`:

```ts
import { runKernel } from './run-kernel.ts';
import { exportRunToVault } from './vault-export.ts';

export const defaultKernelArgs = {
  runId: 'run_fsd_ownership_fixture',
  casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
  fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
  knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
  memoryMode: 'auto' as const,
  outDir: 'kernel/out/vault',
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = await runKernel(defaultKernelArgs);
  const manifest = await exportRunToVault(run, defaultKernelArgs.outDir);
  console.log(JSON.stringify({
    runId: run.id,
    caseId: run.caseStudy.id,
    problemRecovery: run.problemRecovery.id,
    candidates: run.candidates.length,
    child: run.fusion?.child.id || null,
    files: manifest.files,
  }, null, 2));
}
```

- [ ] **Step 3: Update README**

Add to `README.md`:

```md
## Dalton Kernel Fixture

Run the deterministic fixture kernel:

```bash
npm test
npm run kernel:run
```

The command writes markdown-vault artifacts and `trace.json` under `kernel/out/vault/`.
```

- [ ] **Step 4: Run verification**

Run:

```bash
npm test
npm run kernel:run
git diff --check
```

Expected: tests pass, CLI prints JSON with a child ID, and generated files appear under `kernel/out/vault/`.

- [ ] **Step 5: Commit**

Run:

```bash
git add kernel/src/cli.ts kernel/test/cli.test.ts README.md
git commit -m "feat: add dalton kernel proof runner"
```

## Task 8: Final Verification And Push

**Files:**
- No new files.

- [ ] **Step 1: Run all verification**

Run:

```bash
npm test
npm run kernel:run
git diff --check
```

Expected:

- all Node tests pass
- CLI output includes `run_fsd_ownership_fixture`
- CLI output includes a non-null child ID
- `git diff --check` has no output

- [ ] **Step 2: Check Git identity**

Run:

```bash
git config user.name
git config user.email
```

Expected:

```text
loopstrangest
loopstrangest@users.noreply.github.com
```

- [ ] **Step 3: Scan staged changes for secrets and personal identity**

Run the staged-diff scan mandated by `memory-bank/handoffs/doppl-prime-dalton-kernel.md` before any final commit. Keep the command in the handoff as the source of truth so the plan itself does not create false positives in future scans.

Expected: no output unless the only match is the handoff's own instruction text.

- [ ] **Step 4: Verify commit metadata**

Run:

```bash
git show -s --format='author=%an <%ae>%ncommitter=%cn <%ce>' HEAD
```

Expected:

```text
author=loopstrangest <loopstrangest@users.noreply.github.com>
committer=loopstrangest <loopstrangest@users.noreply.github.com>
```

- [ ] **Step 5: Push**

Run:

```bash
git push
```

Expected: `dalton -> dalton`.

## Self-Review Notes

- Spec coverage: every first-slice requirement maps to a task: contracts, case loading, knowledge gateway/replay, recovery, candidates, critics, fitness, parent selection, compatibility, weighted fusion, trace, vault export, tests, and CLI inspection.
- Scope: live model calls, Postgres, Langfuse, Neo4j runtime storage, polished web UI, Railway, and auth remain deferred implementation layers and are not required for this fixture kernel.
- Type consistency: `KernelRun`, `KnowledgePacket`, `ProblemRecovery`, `CandidateSolution`, `CriticVerdict`, `FitnessRecord`, `PairCompatibility`, `InheritanceWeights`, `FusionResult`, and `VaultExportManifest` are introduced before use.
