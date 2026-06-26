import { FinalJudgeAxis, FinalJudgeRubric } from '@doppl/contracts';

/**
 * P4.3 held-out-judge rubric LOAD path (KEY SAFETY RULE #6 — the held-out judge, its rubric, and the
 * scoring policy are immutable to agents; ARCHITECTURE.md §7/§8/§14). This is the runtime enforcement of
 * the two properties the frozen `FinalJudgeRubric` CONTRACT cannot pin (lesson 6):
 *
 *   1. full-axis-set completeness — `axes: z.array(FinalJudgeAxis)` validates each element but NOT that
 *      all 5 axes are present with no duplicate; that exact-5-set check is THIS load path's job.
 *   2. `immutableToAgents:true` re-assert — a defense-in-depth enforcement boundary beyond the schema's
 *      `z.literal(true)` (survives a future schema relaxation).
 *
 * PURE: validates an already-loaded `source`, never reads a file/env itself (IO is the boot layer's job,
 * lesson 4) — mirrors `validateRunConfig`. Throws a field-identifying error so boot fails fast (§15).
 * The boot layer MUST pass an IMMUTABLE source ({@link DEFAULT_JUDGE_RUBRIC}, a frozen in-code const),
 * NEVER an agenome/candidate-derived path (rule #6 / §14).
 */

const REQUIRED_AXES = FinalJudgeAxis.options;

/** Recursively freeze an object so the bedrock anchor cannot be mutated in place at runtime. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const member of Object.values(value as Record<string, unknown>)) {
      deepFreeze(member);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Validate an already-loaded judge rubric `source` and return the immutable {@link FinalJudgeRubric}, or
 * throw a field-identifying error. Enforces (a) the frozen schema (strict — rejects an authority field, a
 * non-true `immutableToAgents`, a missing/empty `policyVersion`), (b) full-axis-set completeness (exactly
 * the 5 `FinalJudgeAxis` members, no missing/duplicate), and (c) an `immutableToAgents === true` re-assert.
 */
export function loadJudgeRubric(source: unknown): FinalJudgeRubric {
  // 1. Frozen-schema validation. Field-identifying error (each offending path named) → fail-fast boot (§15).
  const result = FinalJudgeRubric.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid judge rubric — ${details}`);
  }
  const rubric = result.data;

  // 2. Full-axis-set completeness — the property the CONTRACT can't enforce (lesson 6). The LOAD PATH
  //    throws this (not the schema), so the message names `axes` (field-identifying, §15).
  const present = new Set(rubric.axes);
  const complete =
    rubric.axes.length === REQUIRED_AXES.length &&
    present.size === REQUIRED_AXES.length &&
    REQUIRED_AXES.every((axis) => present.has(axis));
  if (!complete) {
    throw new Error(
      `Invalid judge rubric — axes: must be exactly the ${REQUIRED_AXES.length} FinalJudgeAxis members ` +
        `with no missing or duplicate axis (got [${rubric.axes.join(', ')}])`,
    );
  }

  // 3. immutableToAgents re-assert (rule #6 enforcement boundary). Read through an `unknown`-typed local
  //    so this stays a REAL runtime check (not dead code the schema's literal(true) narrowing elides) —
  //    it survives a future schema relaxation.
  const immutableFlag: unknown = rubric.immutableToAgents;
  if (immutableFlag !== true) {
    throw new Error(
      'Invalid judge rubric — immutableToAgents: must be true (the held-out anchor is unflippable)',
    );
  }

  return rubric;
}

/**
 * The immutable MVP held-out rubric — the bedrock fitness anchor (rule #6). A frozen, version-controlled
 * in-code const is the strongest "never agent-writable" source (it is source, not a runtime-writable
 * file). Full 5-axis set, equal axis weights with a small §7 energy-efficiency tiebreak (a NON-axis weight
 * key; values are the deferred-open scoring piece, lesson 6), `immutableToAgents:true`, a `policyVersion`.
 */
const mvpJudgeRubric: FinalJudgeRubric = {
  axes: ['grounding', 'novelty', 'feasibility', 'falsification_survival', 'subtype_check_pass'],
  weights: {
    grounding: 1,
    novelty: 1,
    feasibility: 1,
    falsification_survival: 1,
    subtype_check_pass: 1,
    energy_efficiency: 0.1,
  },
  // EXPERIMENT (judge gradient) — Wave 2 Step 4 (Michael-signed-off): bumped mvp-2 → mvp-3 for the 0–5 → 0–10
  // per-axis scale widen + the comparative (peer-context) judge (`comparative-judge.ts`), both targeting the
  // central-tendency compression that capped the dominant judge_acceptance weight (~0.68, 5–6 distinct values)
  // and stalled the climb. Immutability-via-versioning (rule #6, lesson 12): the version records that the
  // judge's scoring behavior moved, so every JudgeResult is bound to its exact judge version. Axes / weights /
  // immutability are UNCHANGED — the scale + peer-context are runtime concerns, not rubric fields.
  policyVersion: 'final-judge-mvp-3',
  immutableToAgents: true,
};

export const DEFAULT_JUDGE_RUBRIC: FinalJudgeRubric = deepFreeze(mvpJudgeRubric);
