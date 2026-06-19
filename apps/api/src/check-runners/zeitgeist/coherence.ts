import type { ZeitgeistSynthesisPayload } from "@doppl/contracts";
import { defineCheckAdapter } from "../registry.js";

/**
 * zeitgeist.coherence (P4.10) — confirms thesis, audience,
 * currentSignals, and whyNow hang together: the audience and a key
 * currentSignal token both appear (in lowercase) somewhere in the
 * thesis OR whyNow text. Heuristic; ships the adapter shape.
 */

interface CandidateWithPayload {
  subtypePayload?: ZeitgeistSynthesisPayload;
}

function firstWord(s: string): string {
  return (s.toLowerCase().match(/[a-z0-9]+/) ?? [""])[0] ?? "";
}

export const zeitgeistCoherence = defineCheckAdapter({
  id: "zeitgeist.coherence",
  checkType: "zeitgeist.coherence",
  description: "Heuristic alignment between thesis, audience, signals, and whyNow",
  capabilities: ["structural"],
  fn: async (input) => {
    const payload = (input.candidate as CandidateWithPayload | undefined)?.subtypePayload;
    if (!payload) {
      return {
        checkType: "zeitgeist.coherence",
        status: "skipped",
        skipReason: "missing_subtype_payload",
        evidenceRefs: [],
      };
    }
    const body = `${payload.thesis} ${payload.whyNow}`.toLowerCase();
    const audienceToken = firstWord(payload.audience);
    const audienceMentioned = audienceToken.length > 0 && body.includes(audienceToken);
    const signalToken = payload.currentSignals[0] ? firstWord(payload.currentSignals[0]) : "";
    const signalMentioned = signalToken.length > 0 && body.includes(signalToken);
    const ok = audienceMentioned && signalMentioned;
    return {
      checkType: "zeitgeist.coherence",
      status: ok ? "passed" : "failed",
      score: ok ? 0.8 : 0.3,
      output: { audienceMentioned, signalMentioned },
      evidenceRefs: [],
    };
  },
});
