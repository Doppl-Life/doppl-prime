import { describe, expect, test } from "vitest";
import {
  PREPARED_TRANSFER_PROBLEMS,
  transferAllowlistedExecutable,
} from "../allowlisted-executable.js";
import { transferMappingQuality } from "../mapping-quality.js";
import { transferPriorArt } from "../prior-art.js";
import { transferSourceValidity } from "../source-validity.js";
import { transferTargetFit } from "../target-fit.js";

const VALID_CANDIDATE = {
  id: "cand_1",
  runId: "run_1",
  subtype: "cross_domain_transfer" as const,
  subtypePayload: {
    sourceDomain: "biology",
    sourceTechnique: "natural selection",
    targetDomain: "ML",
    targetProblem: "regression_overfit",
    transferMapping:
      "fitness pressure in biology maps to validation loss in ML; surviving variants resist overfit",
    expectedMechanism: "diversity sampler",
  },
};

const RUN_CTX = {};
const NO_EXTRAS = { candidate: VALID_CANDIDATE };

describe("transfer.source_validity", () => {
  test("returns passed for a structurally-sound candidate", async () => {
    const result = await transferSourceValidity.fn(NO_EXTRAS, RUN_CTX);
    expect(result.status).toBe("passed");
    expect(result.checkType).toBe("transfer.source_validity");
    expect(result.score).toBe(1);
  });

  test("returns failed for too-short sourceDomain", async () => {
    const result = await transferSourceValidity.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: { ...VALID_CANDIDATE.subtypePayload, sourceDomain: "x" },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
  });

  test("skipped + missing_subtype_payload when payload absent", async () => {
    const result = await transferSourceValidity.fn({ candidate: { id: "no_payload" } }, RUN_CTX);
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("missing_subtype_payload");
  });
});

describe("transfer.target_fit", () => {
  test("passes when transferMapping mentions targetDomain or targetProblem", async () => {
    const result = await transferTargetFit.fn(NO_EXTRAS, RUN_CTX);
    expect(result.status).toBe("passed");
  });

  test("fails when transferMapping mentions neither", async () => {
    const result = await transferTargetFit.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: {
            ...VALID_CANDIDATE.subtypePayload,
            transferMapping: "an unrelated description with no overlap",
          },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
  });
});

describe("transfer.mapping_quality", () => {
  test("passes when mapping is long enough and mentions both source + target", async () => {
    const result = await transferMappingQuality.fn(NO_EXTRAS, RUN_CTX);
    expect(result.status).toBe("passed");
  });

  test("fails for a tiny mapping string", async () => {
    const result = await transferMappingQuality.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: { ...VALID_CANDIDATE.subtypePayload, transferMapping: "tiny" },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
  });

  test("fails when mapping omits target domain", async () => {
    const result = await transferMappingQuality.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: {
            ...VALID_CANDIDATE.subtypePayload,
            transferMapping: "biology selection drives some unrelated thing entirely",
          },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
  });
});

describe("transfer.prior_art", () => {
  test("skipped + no_corpus_provided when ctx.deps.transferCorpus is absent", async () => {
    const result = await transferPriorArt.fn(NO_EXTRAS, RUN_CTX);
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("no_corpus_provided");
  });

  test("skipped + no_corpus_match when domain has no matching techniques", async () => {
    const result = await transferPriorArt.fn(NO_EXTRAS, {
      deps: { transferCorpus: { byDomain: { biology: ["mitosis", "photosynthesis"] } } },
    });
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("no_corpus_match");
  });

  test("passed when a corpus entry matches the candidate's sourceTechnique", async () => {
    const result = await transferPriorArt.fn(NO_EXTRAS, {
      deps: { transferCorpus: { byDomain: { biology: ["natural selection"] } } },
    });
    expect(result.status).toBe("passed");
  });
});

describe("transfer.allowlisted_executable", () => {
  test("passes for a prepared targetProblem", async () => {
    const result = await transferAllowlistedExecutable.fn(NO_EXTRAS, RUN_CTX);
    expect(result.status).toBe("passed");
    expect(PREPARED_TRANSFER_PROBLEMS.has("regression_overfit")).toBe(true);
  });

  test("skipped + unprepared_problem when targetProblem is not on the allowlist", async () => {
    const result = await transferAllowlistedExecutable.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: { ...VALID_CANDIDATE.subtypePayload, targetProblem: "novel_unknown" },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("unprepared_problem:novel_unknown");
  });

  test("extras.preparedProblemId overrides candidate's targetProblem", async () => {
    const result = await transferAllowlistedExecutable.fn(
      { candidate: VALID_CANDIDATE, extras: { preparedProblemId: "embedding_collapse" } },
      RUN_CTX,
    );
    expect(result.status).toBe("passed");
    expect((result.output as { problemId: string }).problemId).toBe("embedding_collapse");
  });
});

describe("evidence-ref discipline (all 5 adapters)", () => {
  const ADAPTERS = [
    transferSourceValidity,
    transferTargetFit,
    transferMappingQuality,
    transferPriorArt,
    transferAllowlistedExecutable,
  ];
  test("every adapter's CheckResult.evidenceRefs[*] is empty or Postgres-tier", async () => {
    for (const adapter of ADAPTERS) {
      const result = await adapter.fn(NO_EXTRAS, RUN_CTX);
      for (const ref of result.evidenceRefs ?? []) {
        // Phase 0 EvidenceRef.kind must be one of the closed set; the
        // refinements in evidence-ref.ts already enforce "Postgres tier"
        // by disallowing external URI dereference at runtime — here we
        // just assert nothing slipped through with kind absent.
        expect(ref.kind).toBeDefined();
      }
    }
  });
});
