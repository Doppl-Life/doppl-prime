import { describe, expect, test } from "vitest";
import { zeitgeistCoherence } from "../coherence.js";
import { zeitgeistCurrentSignalGrounding } from "../current-signal-grounding.js";
import { zeitgeistFalsifiability } from "../falsifiability.js";
import { zeitgeistNovelty } from "../novelty.js";
import { zeitgeistTiming } from "../timing.js";

const VALID_CANDIDATE = {
  id: "cand_z1",
  runId: "run_z1",
  subtype: "zeitgeist_synthesis" as const,
  subtypePayload: {
    thesis: "Smaller agent-eval models will outpace evaluator hosting in 2026",
    audience: "evaluator vendors",
    currentSignals: ["agent eval benchmarks proliferating", "evaluator latency budgets shrinking"],
    whyNow:
      "Agent-runtime startups need eval that fits inside their own latency budget; central-eval SaaS can't keep up",
    falsifiablePredictions: [
      "agent eval revenue from inference vendors will exceed dedicated eval SaaS by Q4 2026",
      "more than half of the top 20 agent products will ship an embedded evaluator",
    ],
    comparablePriorArt: ["central-evaluator services", "GitHub Actions-based eval pipelines"],
  },
};

const NO_EXTRAS = { candidate: VALID_CANDIDATE };
const RUN_CTX = {};

describe("zeitgeist.current_signal_grounding", () => {
  test("skipped + no_corpus_provided when corpus absent", async () => {
    const result = await zeitgeistCurrentSignalGrounding.fn(NO_EXTRAS, RUN_CTX);
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("no_corpus_provided");
  });

  test("passed when at least one currentSignal token matches the corpus", async () => {
    const result = await zeitgeistCurrentSignalGrounding.fn(NO_EXTRAS, {
      deps: { zeitgeistCorpus: { knownSignalTokens: ["agent eval"] } },
    });
    expect(result.status).toBe("passed");
  });

  test("skipped + no_corpus_match when corpus has no overlap", async () => {
    const result = await zeitgeistCurrentSignalGrounding.fn(NO_EXTRAS, {
      deps: { zeitgeistCorpus: { knownSignalTokens: ["completely unrelated"] } },
    });
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("no_corpus_match");
  });

  test("failed when currentSignals is empty", async () => {
    const result = await zeitgeistCurrentSignalGrounding.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: { ...VALID_CANDIDATE.subtypePayload, currentSignals: [] },
        },
      },
      { deps: { zeitgeistCorpus: { knownSignalTokens: ["x"] } } },
    );
    expect(result.status).toBe("failed");
  });
});

describe("zeitgeist.novelty", () => {
  test("passed when thesis is not a restatement of prior art and prior art is declared", async () => {
    const result = await zeitgeistNovelty.fn(NO_EXTRAS, RUN_CTX);
    expect(result.status).toBe("passed");
  });

  test("failed when no prior art is declared", async () => {
    const result = await zeitgeistNovelty.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: { ...VALID_CANDIDATE.subtypePayload, comparablePriorArt: [] },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
    expect((result.output as { reason: string }).reason).toBe("no_prior_art_declared");
  });

  test("failed when thesis is a literal restatement of a prior-art entry", async () => {
    const restated = "central-evaluator services in 2026";
    const result = await zeitgeistNovelty.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: { ...VALID_CANDIDATE.subtypePayload, thesis: restated },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
  });
});

describe("zeitgeist.timing", () => {
  test("passed when whyNow has substance", async () => {
    const result = await zeitgeistTiming.fn(NO_EXTRAS, RUN_CTX);
    expect(result.status).toBe("passed");
  });

  test("failed for too-short whyNow", async () => {
    const result = await zeitgeistTiming.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: { ...VALID_CANDIDATE.subtypePayload, whyNow: "soon" },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
  });

  test("failed for whyNow=tbd placeholder", async () => {
    // "tbd" is short anyway; just ensure the regex catches the placeholder
    // if someone pads it. Use a longer phrase that hits the regex.
    const result = await zeitgeistTiming.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: { ...VALID_CANDIDATE.subtypePayload, whyNow: "TBD" },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
  });
});

describe("zeitgeist.coherence", () => {
  test("passed when thesis+whyNow mention audience + first signal token", async () => {
    const result = await zeitgeistCoherence.fn(NO_EXTRAS, RUN_CTX);
    expect(result.status).toBe("passed");
  });

  test("failed when thesis+whyNow drop the audience reference", async () => {
    const result = await zeitgeistCoherence.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: {
            ...VALID_CANDIDATE.subtypePayload,
            audience: "extragalactic civilizations",
          },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
  });
});

describe("zeitgeist.falsifiability", () => {
  test("passed when predictions are specific", async () => {
    const result = await zeitgeistFalsifiability.fn(NO_EXTRAS, RUN_CTX);
    expect(result.status).toBe("passed");
  });

  test("failed when no predictions declared", async () => {
    const result = await zeitgeistFalsifiability.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: {
            ...VALID_CANDIDATE.subtypePayload,
            falsifiablePredictions: [],
          },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
  });

  test("failed when all predictions are too vague", async () => {
    const result = await zeitgeistFalsifiability.fn(
      {
        candidate: {
          ...VALID_CANDIDATE,
          subtypePayload: {
            ...VALID_CANDIDATE.subtypePayload,
            falsifiablePredictions: ["yes", "no", "ok"],
          },
        },
      },
      RUN_CTX,
    );
    expect(result.status).toBe("failed");
  });
});
