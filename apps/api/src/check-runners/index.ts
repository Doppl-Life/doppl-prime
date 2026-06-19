import { transferAllowlistedExecutable } from "./transfer/allowlisted-executable.js";
import { transferMappingQuality } from "./transfer/mapping-quality.js";
import { transferPriorArt } from "./transfer/prior-art.js";
import { transferSourceValidity } from "./transfer/source-validity.js";
import { transferTargetFit } from "./transfer/target-fit.js";
import { zeitgeistCoherence } from "./zeitgeist/coherence.js";
import { zeitgeistCurrentSignalGrounding } from "./zeitgeist/current-signal-grounding.js";
import { zeitgeistFalsifiability } from "./zeitgeist/falsifiability.js";
import { zeitgeistNovelty } from "./zeitgeist/novelty.js";
import { zeitgeistTiming } from "./zeitgeist/timing.js";

export { buildCheckRegistry, defineCheckAdapter } from "./registry.js";
export type {
  CheckCtx,
  CheckInput,
  CheckRegistry,
  CheckRunnerFn,
  RegisteredCheckAdapter,
} from "./registry.js";
export { CheckRegistryError } from "./registry.js";
export { runCheck } from "./run-check.js";
export type { RunCheckInput } from "./run-check.js";
// rerunCheck + LIVE_RERUNNABLE_ADAPTER_IDS are added by U10 (live-rerun.ts).

export const TRANSFER_ADAPTER_IDS = [
  "transfer.source_validity",
  "transfer.target_fit",
  "transfer.mapping_quality",
  "transfer.prior_art",
  "transfer.allowlisted_executable",
] as const;

export const ZEITGEIST_ADAPTER_IDS = [
  "zeitgeist.current_signal_grounding",
  "zeitgeist.novelty",
  "zeitgeist.timing",
  "zeitgeist.coherence",
  "zeitgeist.falsifiability",
] as const;

export const ALL_ADAPTERS = [
  transferSourceValidity,
  transferTargetFit,
  transferMappingQuality,
  transferPriorArt,
  transferAllowlistedExecutable,
  zeitgeistCurrentSignalGrounding,
  zeitgeistNovelty,
  zeitgeistTiming,
  zeitgeistCoherence,
  zeitgeistFalsifiability,
] as const;
