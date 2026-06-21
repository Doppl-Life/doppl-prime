# Layperson Explanation for Surviving Ideas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a model-generated `explanation` field to every candidate idea so the "Final surviving idea" panel and the Candidate inspector describe the winner in plain English instead of jargon.

**Architecture:** Optional, additive contract field on `CandidateIdea`. Generated at proposal time by the existing `population_generator` step (no new pipeline stage). Flows through the existing `candidate.created` event payload → web reducer → panels.

**Tech Stack:** TypeScript, Zod (contracts), vitest, React, pnpm workspaces.

## Global Constraints

- Field is **optional** at the schema layer (`z.string().min(1).optional()`); old replays must keep parsing.
- No new event type, no new pipeline stage, no projection changes.
- UI must gracefully fall back to the existing `summary` when `explanation` is absent.
- Follow project commit style: conventional commits (`feat:`, `test:`, etc.), short scope tag where helpful.

---

### Task 1: Add optional `explanation` to `CandidateIdea` contract

**Files:**
- Modify: `packages/contracts/src/domain/candidate-idea.ts:31-41`
- Modify: `packages/contracts/src/domain/__tests__/candidate-idea.fieldset.test.ts:54-68` (snapshot) and add a new test.

**Interfaces:**
- Consumes: nothing.
- Produces: `CandidateIdea.explanation?: string` (Zod-validated `.min(1).optional()`); auto-derived `CandidateIdeaFieldNames` gains an `"explanation"` entry.

- [ ] **Step 1: Write the failing test for parsing with explanation**

Append to `packages/contracts/src/domain/__tests__/candidate-idea.fieldset.test.ts` inside the `describe(\`${spec("§3")} CandidateIdea\`, …)` block:

```ts
  test("parses a candidate that includes an optional explanation", () => {
    const withExplanation = { ...xdomain, explanation: "In plain English: it borrows a trick from plumbing." };
    expect(CandidateIdea.parse(withExplanation)).toEqual(withExplanation);
  });

  test("parses a candidate that omits the optional explanation (back-compat)", () => {
    // xdomain has no `explanation` key; should still parse.
    expect(CandidateIdea.parse(xdomain)).toEqual(xdomain);
  });

  test("rejects an empty-string explanation (min(1) guard)", () => {
    expect(() => CandidateIdea.parse({ ...xdomain, explanation: "" })).toThrow();
  });
```

- [ ] **Step 2: Run the new tests and the snapshot test, confirm failure**

Run: `pnpm --filter @doppl/contracts test candidate-idea.fieldset`
Expected: the new "parses a candidate that includes an optional explanation" test FAILS (Zod rejects unknown key under `.strict()`), and the existing "top-level field-name set is frozen" snapshot still PASSES.

- [ ] **Step 3: Add `explanation` to `baseCandidateFields`**

In `packages/contracts/src/domain/candidate-idea.ts`, modify the `baseCandidateFields` object (currently lines 31–41) to:

```ts
const baseCandidateFields = {
  id: z.string().min(1),
  runId: z.string().min(1),
  generationId: z.string().min(1),
  agenomeId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  explanation: z.string().min(1).optional(),
  claims: z.array(z.string()),
  evidenceRefs: z.array(EvidenceRef),
  status: CandidateStatus,
};
```

No other changes in this file — `CandidateIdeaFieldNames` derives from `Object.keys(baseCandidateFields)` so the export auto-updates.

- [ ] **Step 4: Update the frozen field-name snapshot**

In `packages/contracts/src/domain/__tests__/candidate-idea.fieldset.test.ts`, update the `toMatchInlineSnapshot` block (currently lines 54–68) to:

```ts
    expect(CandidateIdeaFieldNames).toMatchInlineSnapshot(`
      [
        "agenomeId",
        "claims",
        "evidenceRefs",
        "explanation",
        "generationId",
        "id",
        "runId",
        "status",
        "subtype",
        "subtypePayload",
        "summary",
        "title",
      ]
    `);
```

- [ ] **Step 5: Run all candidate-idea tests, confirm pass**

Run: `pnpm --filter @doppl/contracts test candidate-idea.fieldset`
Expected: All tests PASS, including the 3 new ones and the updated snapshot.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/domain/candidate-idea.ts \
        packages/contracts/src/domain/__tests__/candidate-idea.fieldset.test.ts
git commit -m "feat(contracts): add optional CandidateIdea.explanation (layperson summary)"
```

---

### Task 2: API generation loop extracts `explanation` + system-prompt update + fixture

**Files:**
- Modify: `apps/api/src/runtime/generation-loop.ts:219-251`
- Modify: `apps/api/src/runtime/seeds/gen-0-agenomes.ts:17-103` (all 5 `systemPrompt` strings)
- Modify: `apps/api/__fixtures__/recorded-responses/openrouter/population_generator/default.json`
- Test: `apps/api/src/runtime/__tests__/generation-loop.test.ts` (existing; add a test case) — confirm exact file path with `ls apps/api/src/runtime/__tests__/` and use the file there that already covers `candidate.created` event emission. If no such file exists, create `apps/api/src/runtime/__tests__/generation-loop-explanation.test.ts` and copy the minimal `Deps` setup pattern from the closest sibling test.

**Interfaces:**
- Consumes: `CandidateIdea` from Task 1 (now allows `explanation`).
- Produces: `candidate.created` event payload's nested `candidate` object now includes `explanation: string` when the model output JSON contained a non-empty `explanation` key; otherwise the key is omitted.

- [ ] **Step 1: Write the failing test for explanation in the emitted event**

Locate the existing test in `apps/api/src/runtime/__tests__/` that asserts on `candidate.created` event payload (search: `grep -rn "candidate.created" apps/api/src/runtime/__tests__/`). Add a new test next to it that:
- Stubs the gateway to return `output: '{"subtype":"cross_domain_transfer","title":"X","summary":"Y","explanation":"In plain English: a clear analogy."}'`.
- Drives one generation.
- Asserts the appended `candidate.created` event's `payload.candidate.explanation === "In plain English: a clear analogy."`.

And a second test:
- Same setup but model omits `explanation`.
- Asserts the appended event's `payload.candidate.explanation === undefined` (key not present).

- [ ] **Step 2: Run new tests, confirm failure**

Run: `pnpm --filter @doppl/api test generation-loop`
Expected: the two new tests FAIL — the emitted event lacks `explanation` because the parser doesn't pull it.

- [ ] **Step 3: Modify the generation-loop parser to extract `explanation`**

In `apps/api/src/runtime/generation-loop.ts`, locate the `candidate.created` event emission (currently lines 223–251). Add an `explanation` extraction *above* the `appendEvent` call and conditionally include it in the candidate payload:

```ts
const explanationValue = str("explanation", "");
await appendEvent(deps.db, {
  runId: input.runId,
  type: "candidate.created",
  actor: "agenome",
  agenomeId: agenome.id,
  candidateId,
  payload: {
    candidate: {
      id: candidateId,
      runId: input.runId,
      generationId: `gen_${input.generationIndex}`,
      agenomeId: agenome.id,
      subtype: str("subtype", "cross_domain_transfer"),
      title: str("title", "Generated candidate"),
      summary: str("summary", "From generation loop"),
      ...(explanationValue ? { explanation: explanationValue } : {}),
      claims: [],
      evidenceRefs: [],
      status: "created",
      subtypePayload: {
        sourceDomain: str("sourceDomain", "biology"),
        sourceTechnique: str("sourceTechnique", "selection"),
        targetDomain: str("targetDomain", "ML"),
        targetProblem: str("targetProblem", "collapse"),
        transferMapping: str("transferMapping", "fitness → loss"),
        expectedMechanism: str("expectedMechanism", "diversity sampler"),
      },
    },
  },
});
```

The conditional spread keeps the key out of the event when the model didn't produce an explanation, which preserves replay byte-stability for older runs.

- [ ] **Step 4: Run new tests, confirm pass**

Run: `pnpm --filter @doppl/api test generation-loop`
Expected: both new tests PASS. Existing tests in the file still PASS.

- [ ] **Step 5: Update the 5 agenome system prompts with the output contract**

In `apps/api/src/runtime/seeds/gen-0-agenomes.ts`, append a shared paragraph to each of the 5 `systemPrompt` strings (lines 21, 38, 55, 72, 89). The paragraph must be identical across all 5 to keep the contract uniform. After the edit, each system prompt becomes the current persona text + a newline + this paragraph:

```
Output: respond with a single JSON object containing keys "subtype" (one of "cross_domain_transfer", "zeitgeist_synthesis"), "title" (short noun phrase), "summary" (1-sentence technical summary using domain terms), and "explanation" (1–2 sentences a smart non-expert could understand: no jargon, no abbreviations, analogies welcome). For "cross_domain_transfer" also include "sourceDomain", "sourceTechnique", "targetDomain", "targetProblem", "transferMapping", "expectedMechanism".
```

Concretely, the Explorer entry becomes:

```ts
    systemPrompt:
      "You are an explorer agent. Generate candidate ideas by drawing wide analogies across domains. Privilege novelty and breadth over verifiability.\n\nOutput: respond with a single JSON object containing keys \"subtype\" (one of \"cross_domain_transfer\", \"zeitgeist_synthesis\"), \"title\" (short noun phrase), \"summary\" (1-sentence technical summary using domain terms), and \"explanation\" (1–2 sentences a smart non-expert could understand: no jargon, no abbreviations, analogies welcome). For \"cross_domain_transfer\" also include \"sourceDomain\", \"sourceTechnique\", \"targetDomain\", \"targetProblem\", \"transferMapping\", \"expectedMechanism\".",
```

Apply the same `\n\nOutput: …` append to the Rigorist, Connector, Skeptic, and Synthesist entries verbatim.

- [ ] **Step 6: Update the recorded fixture to include `explanation`**

Modify `apps/api/__fixtures__/recorded-responses/openrouter/population_generator/default.json`. Replace the existing `output` value so the embedded JSON includes an explanation:

```json
{
  "ok": true,
  "output": "{\"subtype\":\"cross_domain_transfer\",\"title\":\"recorded candidate\",\"summary\":\"placeholder\",\"explanation\":\"In plain English: a recorded test idea used to drive deterministic replays.\"}",
  "repairAttempts": 0,
  "providerTraceId": "completion_recorded_popgen",
  "langfuseObservationId": "obs_recorded_popgen",
  "energyEstimate": 5,
  "energyActual": 5
}
```

- [ ] **Step 7: Run full API test suite**

Run: `pnpm --filter @doppl/api test`
Expected: all PASS. If any existing test in `apps/api/src/runtime/seeds/__tests__/seeds.test.ts` snapshots the system prompt strings, update those snapshots in the same commit. (Check first with: `grep -rn "systemPrompt\|Explorer\|Rigorist" apps/api/src/runtime/seeds/__tests__/`.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/runtime/generation-loop.ts \
        apps/api/src/runtime/seeds/gen-0-agenomes.ts \
        apps/api/__fixtures__/recorded-responses/openrouter/population_generator/default.json \
        apps/api/src/runtime/__tests__/
git commit -m "feat(api): emit candidate.explanation from generation loop + prompt contract"
```

---

### Task 3: Web store — extend `CandidateView` and populate `explanation`

**Files:**
- Modify: `apps/web/src/state/reducer.ts:56-64` (interface) and `:377-405` (reducer case)
- Test: `apps/web/src/state/__tests__/reducer.test.ts` — add a test case

**Interfaces:**
- Consumes: `cand.explanation?: string` on the `candidate.created` payload (from Task 2).
- Produces: `CandidateView.explanation?: string`, populated in store after `candidate.created` events that carry the field.

- [ ] **Step 1: Write the failing reducer test**

Append to `apps/web/src/state/__tests__/reducer.test.ts` (inside the most relevant existing `describe` for `candidate.created`):

```ts
  test("candidate.created with explanation populates CandidateView.explanation", () => {
    const before = initialRunStoreState;
    const event = {
      id: "evt_1",
      runId: "run_x",
      type: "candidate.created" as const,
      actor: "agenome" as const,
      agenomeId: "ag_1",
      candidateId: "cand_1",
      sequence: 1,
      timestamp: new Date().toISOString(),
      payload: {
        candidate: {
          id: "cand_1",
          runId: "run_x",
          generationId: "gen_0",
          agenomeId: "ag_1",
          subtype: "cross_domain_transfer",
          title: "T",
          summary: "S",
          explanation: "In plain English: a clear analogy.",
          claims: [],
          evidenceRefs: [],
          status: "created",
          subtypePayload: {
            sourceDomain: "a", sourceTechnique: "b",
            targetDomain: "c", targetProblem: "d",
            transferMapping: "e", expectedMechanism: "f",
          },
        },
      },
    };
    const after = reducer(before, { kind: "EVENT", event });
    expect(after.candidates.cand_1?.explanation).toBe("In plain English: a clear analogy.");
  });

  test("candidate.created without explanation leaves CandidateView.explanation undefined", () => {
    const before = initialRunStoreState;
    const event = {
      id: "evt_2",
      runId: "run_x",
      type: "candidate.created" as const,
      actor: "agenome" as const,
      agenomeId: "ag_1",
      candidateId: "cand_2",
      sequence: 1,
      timestamp: new Date().toISOString(),
      payload: {
        candidate: {
          id: "cand_2",
          runId: "run_x",
          generationId: "gen_0",
          agenomeId: "ag_1",
          subtype: "cross_domain_transfer",
          title: "T",
          summary: "S",
          claims: [],
          evidenceRefs: [],
          status: "created",
          subtypePayload: {
            sourceDomain: "a", sourceTechnique: "b",
            targetDomain: "c", targetProblem: "d",
            transferMapping: "e", expectedMechanism: "f",
          },
        },
      },
    };
    const after = reducer(before, { kind: "EVENT", event });
    expect(after.candidates.cand_2?.explanation).toBeUndefined();
  });
```

If the existing reducer test file uses a different event-construction helper, adapt the shape to match; the important assertions are the two `expect(...explanation...)` lines.

- [ ] **Step 2: Run the new tests, confirm failure**

Run: `pnpm --filter @doppl/web test reducer`
Expected: the "populates" test FAILS — `CandidateView` doesn't have `explanation` and the reducer doesn't copy it.

- [ ] **Step 3: Extend `CandidateView` and the reducer case**

In `apps/web/src/state/reducer.ts`, modify `CandidateView` (currently lines 56–64) to:

```ts
export interface CandidateView {
  id: string;
  agenomeId: string;
  generationId?: string;
  subtype?: string;
  status: string;
  summary?: string;
  title?: string;
  explanation?: string;
}
```

And modify the `candidate.created` case (currently lines 381–393) so the inserted record includes the field conditionally, matching the existing `title` pattern:

```ts
      next.candidates = {
        ...next.candidates,
        [cand.id]: {
          id: cand.id,
          agenomeId: cand.agenomeId,
          generationId: cand.generationId,
          subtype: cand.subtype,
          status: cand.status,
          summary: cand.summary,
          ...((cand as { title?: string }).title !== undefined
            ? { title: (cand as { title: string }).title }
            : {}),
          ...((cand as { explanation?: string }).explanation !== undefined
            ? { explanation: (cand as { explanation: string }).explanation }
            : {}),
        },
      };
```

- [ ] **Step 4: Run the new tests, confirm pass**

Run: `pnpm --filter @doppl/web test reducer`
Expected: both new tests PASS. All existing reducer tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/reducer.ts \
        apps/web/src/state/__tests__/reducer.test.ts
git commit -m "feat(web): wire candidate.explanation through the run store"
```

---

### Task 4: FinalIdeaPanel — render explanation primary, summary as labeled secondary

**Files:**
- Modify: `apps/web/src/panels/FinalIdeaPanel.tsx:132-182` (the render block from kicker through the agent line)
- Test: `apps/web/src/panels/__tests__/FinalIdeaPanel.test.tsx` — add two test cases.

**Interfaces:**
- Consumes: `CandidateView.explanation?: string` from Task 3.
- Produces: nothing downstream. Pure UI.

- [ ] **Step 1: Write the failing UI tests**

Append to `apps/web/src/panels/__tests__/FinalIdeaPanel.test.tsx` inside the existing `describe("FinalIdeaPanel", …)`:

```ts
  test("when winner has an explanation, renders both the explanation and labeled technical summary", () => {
    const state = stateWithWinner();
    state.candidates.cand_hi = {
      ...state.candidates.cand_hi!,
      title: "Surge tanks for traffic",
      summary: "Cross-domain transfer from hydraulic engineering to traffic flow.",
      explanation: "Plain English: borrow a pressure-release trick from water pipes to smooth out traffic jams.",
    };
    renderWithStore(<FinalIdeaPanel />, { initialState: state });
    expect(screen.getByText(/Plain English: borrow a pressure-release trick/)).toBeInTheDocument();
    expect(screen.getByText(/Technical summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Cross-domain transfer from hydraulic engineering/)).toBeInTheDocument();
  });

  test("when winner has no explanation, falls back to single summary line (no 'Technical summary' label)", () => {
    const state = stateWithWinner();
    state.candidates.cand_hi = {
      ...state.candidates.cand_hi!,
      title: "Surge tanks for traffic",
      summary: "Cross-domain transfer from hydraulic engineering to traffic flow.",
      // explanation intentionally omitted
    };
    renderWithStore(<FinalIdeaPanel />, { initialState: state });
    expect(screen.getByText(/Cross-domain transfer from hydraulic engineering/)).toBeInTheDocument();
    expect(screen.queryByText(/Technical summary/i)).toBeNull();
  });
```

- [ ] **Step 2: Run new tests, confirm failure**

Run: `pnpm --filter @doppl/web test FinalIdeaPanel`
Expected: "renders both the explanation and labeled technical summary" FAILS — the panel doesn't render the explanation or the label.

- [ ] **Step 3: Modify the FinalIdeaPanel render block**

In `apps/web/src/panels/FinalIdeaPanel.tsx`, replace the existing block that renders the summary (currently the `{winnerCandidate?.summary && …}` block around lines 157–169) with this conditional pair, placed in the same position right after the `<h2>`:

```tsx
      {winnerCandidate?.explanation ? (
        <>
          <p
            style={{
              margin: "0 0 8px 0",
              color: "var(--doppl-text-primary)",
              fontSize: 15,
              lineHeight: 1.55,
              maxWidth: "72ch",
            }}
          >
            {winnerCandidate.explanation}
          </p>
          {winnerCandidate.summary && winnerCandidate.summary !== winnerTitle && (
            <>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--doppl-text-secondary)",
                  marginTop: 4,
                  marginBottom: 2,
                }}
              >
                Technical summary
              </div>
              <p
                style={{
                  margin: "0 0 10px 0",
                  color: "var(--doppl-text-secondary)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  maxWidth: "72ch",
                }}
              >
                {winnerCandidate.summary}
              </p>
            </>
          )}
        </>
      ) : (
        winnerCandidate?.summary &&
        winnerCandidate.summary !== winnerTitle && (
          <p
            style={{
              margin: "0 0 10px 0",
              color: "var(--doppl-text-secondary)",
              fontSize: 14,
              lineHeight: 1.5,
              maxWidth: "72ch",
            }}
          >
            {winnerCandidate.summary}
          </p>
        )
      )}
```

This preserves the previous fallback rendering for old runs while making `explanation` primary when present.

- [ ] **Step 4: Run new and existing tests, confirm pass**

Run: `pnpm --filter @doppl/web test FinalIdeaPanel`
Expected: all 6 tests PASS (4 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/panels/FinalIdeaPanel.tsx \
        apps/web/src/panels/__tests__/FinalIdeaPanel.test.tsx
git commit -m "feat(web): show layperson explanation as primary text in FinalIdeaPanel"
```

---

### Task 5: CandidateInspector — read title/summary/explanation from store, render layperson block

**Files:**
- Modify: `apps/web/src/panels/CandidateInspector.tsx:94-156`
- Test: `apps/web/src/panels/__tests__/CandidateInspector.test.tsx` — add one test case.

**Interfaces:**
- Consumes: `CandidateView.explanation?: string` from Task 3.
- Produces: nothing downstream. Pure UI.

**Background:** Today the inspector pulls `title` and `summary` from the `getCandidate` API response, but the server projection (`CandidateRow`) drops those fields, so they render empty against a live API. This task switches the title/summary/explanation render to read from the client store (where `candidate.created` events populate them) while leaving the API-driven sections (critic reviews, check results, novelty, fitness, subtypePayload) untouched.

- [ ] **Step 1: Write the failing UI test**

Append to `apps/web/src/panels/__tests__/CandidateInspector.test.tsx`:

```ts
  test("renders title/summary/explanation from the store even when API response lacks them", async () => {
    const client = makeStubClient({
      getCandidate: async () => ({
        runId: "run_x",
        candidate: {
          // API projection is lossy; pretend the server returned only the skeleton.
          id: "cand_se",
          runId: "run_x",
          generationId: "gen_0",
          agenomeId: "ag_1",
          subtype: "cross_domain_transfer",
          // title, summary, subtypePayload intentionally absent from this response
          claims: [],
          evidenceRefs: [],
          status: "scored",
        } as unknown as never,
      }),
    });
    renderWithStore(<CandidateInspector />, {
      client,
      initialState: {
        ...initialRunStoreState,
        runId: "run_x",
        selection: { candidateId: "cand_se", agenomeId: null },
        candidates: {
          cand_se: {
            id: "cand_se",
            agenomeId: "ag_1",
            generationId: "gen_0",
            subtype: "cross_domain_transfer",
            status: "scored",
            title: "Stored title",
            summary: "Stored technical summary.",
            explanation: "Plain English: stored layperson explanation.",
          },
        },
      },
    });
    await waitFor(() => {
      expect(screen.getByText("Stored title")).toBeInTheDocument();
    });
    expect(screen.getByText(/stored layperson explanation/i)).toBeInTheDocument();
    expect(screen.getByText(/Technical summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Stored technical summary\./)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run new test, confirm failure**

Run: `pnpm --filter @doppl/web test CandidateInspector`
Expected: the new test FAILS — the inspector currently reads from `c.title`/`c.summary`, which are `undefined` in the stub response, and never reads `explanation`.

- [ ] **Step 3: Modify CandidateInspector to prefer store fields and render explanation**

In `apps/web/src/panels/CandidateInspector.tsx`, modify the render section (currently lines 147–155). Replace:

```tsx
  const c = data.candidate;
  return (
    <section aria-label="Candidate inspector">
      <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>{c.title}</h2>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <StatusIndicator domain="candidate" status={c.status} />
        <span style={{ color: "var(--doppl-text-secondary)" }}>{c.subtype}</span>
      </div>
      <p style={{ marginTop: 8 }}>{c.summary}</p>
```

with:

```tsx
  const c = data.candidate;
  const stored = state.candidates[c.id];
  const title = stored?.title ?? c.title;
  const summary = stored?.summary ?? c.summary;
  const explanation = stored?.explanation;
  return (
    <section aria-label="Candidate inspector">
      <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>{title}</h2>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <StatusIndicator domain="candidate" status={c.status} />
        <span style={{ color: "var(--doppl-text-secondary)" }}>{c.subtype}</span>
      </div>
      {explanation ? (
        <>
          <p
            style={{
              marginTop: 8,
              marginBottom: 6,
              color: "var(--doppl-text-primary)",
              fontSize: 15,
              lineHeight: 1.55,
            }}
          >
            {explanation}
          </p>
          {summary && (
            <>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--doppl-text-secondary)",
                  marginTop: 4,
                  marginBottom: 2,
                }}
              >
                Technical summary
              </div>
              <p
                style={{
                  margin: "0 0 8px 0",
                  color: "var(--doppl-text-secondary)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {summary}
              </p>
            </>
          )}
        </>
      ) : (
        <p style={{ marginTop: 8 }}>{summary}</p>
      )}
```

Leave the rest of the function (claims, subtype payload blocks, the API-driven sections beneath) unchanged.

- [ ] **Step 4: Run new and existing inspector tests, confirm pass**

Run: `pnpm --filter @doppl/web test CandidateInspector`
Expected: all tests PASS (existing 3 + new 1). The existing tests render their candidates via `getCandidate` stubs that DO include title/summary, and the new code falls back to `c.title`/`c.summary` when store has no entry — so the existing tests are unaffected.

- [ ] **Step 5: Run the full web test suite as a safety net**

Run: `pnpm --filter @doppl/web test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/panels/CandidateInspector.tsx \
        apps/web/src/panels/__tests__/CandidateInspector.test.tsx
git commit -m "feat(web): surface candidate.explanation in CandidateInspector overview"
```

---

## Self-Review

**1. Spec coverage:**
- Contract field (`explanation` optional on `baseCandidateFields`) → Task 1 ✓
- Generation-loop parser pulling `explanation` → Task 2 step 3 ✓
- 5 agenome system prompts updated → Task 2 step 5 ✓
- Recorded fixture updated → Task 2 step 6 ✓
- Web store: `CandidateView.explanation` + reducer populate → Task 3 ✓
- FinalIdeaPanel: explanation primary, summary labeled secondary, fallback when missing → Task 4 ✓
- CandidateInspector: read from store, render explanation block, fallback → Task 5 ✓
- Tests at every layer (contract, API event, reducer, both panels) → all tasks ✓
- Out-of-scope items not added (no post-run summarization stage, no projection fix, no backfill) ✓

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later". Every test step shows real assertions; every code step shows the actual code.

**3. Type consistency:** `CandidateView.explanation?: string` declared in Task 3 is the same name and type used in Tasks 4 and 5. `payload.candidate.explanation` in Task 2 maps to `cand.explanation` in Task 3's reducer case, matching the existing `title`/`summary` pattern.
