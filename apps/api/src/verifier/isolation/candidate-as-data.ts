import type { CriticMandate, ModelGatewayRequest } from "@doppl/contracts";
import { DATA_CLOSE, DATA_FRAMING, DATA_OPEN } from "./sentinel.js";

export { DATA_CLOSE, DATA_FRAMING, DATA_OPEN };

/**
 * Candidate-as-DATA isolation seam (ARCHITECTURE.md §7, IMPLEMENTATION_
 * PLAN.md P4.4). Single chokepoint for assembling any verifier-track
 * ModelGatewayRequest. Candidate text reaches critics / judges / check
 * adapters ONLY inside a sentinel-delimited user-role message; the
 * system message is constructed from trusted templates with no
 * candidate-derived substring.
 *
 * The isolation-lint test in apps/api/src/__tests__/ enforces that no
 * file under apps/api/src/verifier/ or apps/api/src/check-runners/
 * constructs a verifier-role ModelGatewayRequest outside this module
 * (P4.4 single-chokepoint invariant; U11).
 */

export class IsolationViolationError extends Error {
  constructor(reason: string) {
    super(`Candidate-as-DATA isolation violated: ${reason}`);
    this.name = "IsolationViolationError";
  }
}

export interface VerifierAssemblyCommon {
  runId: string;
  correlationId: string;
  generationId?: string;
  agenomeId?: string;
  candidateId?: string;
  schemaForOutput?: unknown;
}

export function wrapCandidateAsData(candidate: unknown): string {
  if (candidate === null || candidate === undefined) {
    throw new IsolationViolationError("candidate must not be null or undefined");
  }
  const json = JSON.stringify(candidate);
  if (json === undefined) {
    throw new IsolationViolationError("candidate is not JSON-serializable");
  }
  if (json.includes(DATA_OPEN) || json.includes(DATA_CLOSE)) {
    throw new IsolationViolationError(
      "candidate carries a literal sentinel substring; refusing to wrap",
    );
  }
  return `${DATA_FRAMING}\n${DATA_OPEN}\n${json}\n${DATA_CLOSE}`;
}

interface AssembledMessages {
  messages: { role: "system" | "user"; content: string }[];
}

function buildRequest(
  role: "critic" | "subtype_check" | "final_judge",
  systemContent: string,
  userContent: string,
  common: VerifierAssemblyCommon,
): ModelGatewayRequest {
  const input: AssembledMessages = {
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
  };
  return {
    role,
    runId: common.runId,
    correlationId: common.correlationId,
    input,
    ...(common.generationId !== undefined ? { generationId: common.generationId } : {}),
    ...(common.agenomeId !== undefined ? { agenomeId: common.agenomeId } : {}),
    ...(common.candidateId !== undefined ? { candidateId: common.candidateId } : {}),
    ...(common.schemaForOutput !== undefined ? { schemaForOutput: common.schemaForOutput } : {}),
  };
}

function buildCriticSystem(mandate: CriticMandate, rubricTemplate: string): string {
  return `You are a critic evaluating a candidate idea under the mandate "${mandate}".\n\nRubric:\n${rubricTemplate}\n\nEmit a structured CriticReview as JSON. Return JSON only.`;
}

function buildJudgeSystem(rubricTemplate: string): string {
  return `You are the held-out final judge. Apply the fixed 5-axis rubric to the candidate. You must score each of the five axes (grounding, novelty, feasibility, falsification_survival, subtype_check_pass) on a 0-5 scale.\n\nRubric:\n${rubricTemplate}\n\nReturn a JSON object only.`;
}

function buildCheckSystem(adapterId: string, checkTemplate: string): string {
  return `You are running check adapter "${adapterId}" against a candidate idea.\n\nCheck description:\n${checkTemplate}\n\nReturn a JSON object describing pass/fail and a short explanation.`;
}

/**
 * Strict json_schema sent to the critic so the model is forced into
 * the exact CriticReview shape that pipeStructuredOutput expects.
 * Without this the model returns its own interpretation (e.g.
 * { factual_grounding: ..., reasoning: ... }) and every critic call
 * fails schema validation.
 *
 * Per-mandate: the scores object is locked to the single mandate
 * being evaluated by this call, so cross-mandate score leakage is
 * impossible at the schema level.
 */
function buildCriticOutputSchema(mandate: CriticMandate): unknown {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      scores: {
        type: "object",
        additionalProperties: false,
        properties: { [mandate]: { type: "number" } },
        required: [mandate],
      },
      critique: { type: "string" },
      confidence: { type: "number" },
      evidenceRefs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: {
              type: "string",
              enum: ["trace", "check_output", "prior_art", "signal", "raw_output", "other"],
            },
            eventId: { type: ["string", "null"] },
            uri: { type: ["string", "null"] },
            label: { type: ["string", "null"] },
            langfuseObservationId: { type: ["string", "null"] },
          },
          required: ["kind", "eventId", "uri", "label", "langfuseObservationId"],
        },
      },
    },
    required: ["scores", "critique", "confidence", "evidenceRefs"],
  };
}

export function assembleCriticRequest(opts: {
  mandate: CriticMandate;
  rubricTemplate: string;
  candidate: unknown;
  common: VerifierAssemblyCommon;
}): ModelGatewayRequest {
  const wrapped = wrapCandidateAsData(opts.candidate);
  const system = buildCriticSystem(opts.mandate, opts.rubricTemplate);
  return buildRequest("critic", system, wrapped, {
    ...opts.common,
    // Use the built critic-output schema by default; a caller that
    // already supplied one (e.g. a test) wins.
    schemaForOutput: opts.common.schemaForOutput ?? buildCriticOutputSchema(opts.mandate),
  });
}

export function assembleJudgeRequest(opts: {
  rubricTemplate: string;
  candidate: unknown;
  common: VerifierAssemblyCommon;
}): ModelGatewayRequest {
  const wrapped = wrapCandidateAsData(opts.candidate);
  const system = buildJudgeSystem(opts.rubricTemplate);
  return buildRequest("final_judge", system, wrapped, opts.common);
}

export function assembleCheckRequest(opts: {
  adapterId: string;
  checkTemplate: string;
  candidate: unknown;
  common: VerifierAssemblyCommon;
}): ModelGatewayRequest {
  const wrapped = wrapCandidateAsData(opts.candidate);
  const system = buildCheckSystem(opts.adapterId, opts.checkTemplate);
  return buildRequest("subtype_check", system, wrapped, opts.common);
}
