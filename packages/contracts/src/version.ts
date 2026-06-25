/**
 * CURRENT_SCHEMA_VERSION — the `schemaVersion` the registry pins as current.
 *
 * Every {@link RunEventEnvelope} carries a `schemaVersion`. Readers accept all `schemaVersion ≤ current`
 * (the replay reader, P1.8, rejects `> current`); the contract itself only requires a positive int.
 *
 * Version history (each bump is the deliberate, snapshot-pinned signal that a closed set changed).
 * The cross-track reconciliation (kernel-020) linearized two independently-numbered lines onto ONE
 * monotonic counter — judge (cody's P0.16) takes v3; the kernel's two status amendments fold together
 * into v4:
 *  - 1 → 2 (P0.1-amend): +11 operation-start markers extended the `RunEventType` registry.
 *  - 2 → 3 (P0.16, judge-output amendment): +`judge.reviewed` terminal type + the `JudgeResult`
 *    narrowing extended the registry + the per-type payload map (§7/§8 verifier→selection seam).
 *  - 3 → 4 (kernel P0.15-amend + P0.5-amend, folded): +`degraded` (`GenerationStatus`, §3
 *    partial-failure edge) and +`repairing` (`CandidateStatus`, §3 structured-output repair edge).
 *  - 4 → 5 (terminal-event amendment): +`run.cancelled` / `generation.skipped` / `agenome.failed` /
 *    `candidate.rejected` `RunEventType` members — the 4 reachable §3/§5 terminals the registry was
 *    missing, so every state-machine terminal is rule-#2 replayable (closes the audited gap).
 *  - 5 → 6 (frontend-v2 FB.0, run-controls amendment): +3 OPTIONAL `RunConfig` run-control fields
 *    (`generationOperators` / `generationBias` / `modelRouteOverride`) + the closed `GenerationOperator`
 *    enum. GENERATION inputs only (rule #5 DATA, rule-#6-safe) — the held-out judge / scoring anchor
 *    (`ScoringPolicy` / `FinalJudgeRubric` / `FinalJudgeAxis`) is BYTE-IDENTICAL across this bump.
 *  - 6 → 7 (frontend-v2 FB.6, raw-capture amendment): +`llm_call_telemetry` `RunEventType` member + the
 *    `LlmCallTelemetry` high-traffic payload model (deep telemetry of a successful GENERATION LLM call —
 *    raw response/reasoning, scrubbed at the persistence boundary rule #4, truncated-with-marker under the
 *    1 MiB ceiling, replay-read rule #7). GENERATION output only — the rule-#6 judge/scoring anchor is
 *    BYTE-IDENTICAL across this bump.
 *  - 7 → 8 (frontend-v2 FB.4, diverge/converge dial amendment): +`samplingParams{temperature?}` (the shared
 *    `SamplingParams`) on `ModelGatewayRequest` (the dial sets `temperature` on the population_generator
 *    request ONLY — rule #6 SOLO) + on `LlmCallTelemetry` (records the EXECUTED temperature, replay-read
 *    rule #7). GENERATION sampling only — the rule-#6 judge/scoring anchor is BYTE-IDENTICAL across this bump.
 *  - 8 → 9 (frontend-v2 FB.8, judge per-axis rationale amendment): +OPTIONAL `axisRationales` (a partial
 *    `FinalJudgeAxis`→string record) on `JudgeResult` — the held-out judge's per-axis one-line EXPLANATION,
 *    emitted alongside its scores and surfaced in the UI (FV.5b). EXPLANATORY OUTPUT only: `acceptance` stays
 *    runner-computed from `axisScores` × the immutable rubric weights, and the rule-#6 anchor (`ScoringPolicy`
 *    / `FinalJudgeRubric` / `FinalJudgeAxis`, incl. `immutableToAgents`) is BYTE-IDENTICAL across this bump —
 *    the rationale explains the floor, it cannot move it.
 *  - 9 → 10 (tool-use TU.1, agent research-tool amendment): the gateway gains a tool-use surface so agents
 *    do their own research (web + X + YouTube) — +`ToolName` (the frozen 4-member allowlist: web_search /
 *    fetch_url / x_search / youtube_search, rule #3), +`ToolDescriptor` / +`ToolCallRequest`, +OPTIONAL
 *    `ModelGatewayRequest.tools?` + +OPTIONAL `ModelGatewayResponse.toolCallRequests?`. (The multi-turn
 *    tool-conversation message variants — an assistant-tool-call echo + a tool-result message, added
 *    WITHOUT widening the closed 3-member `ChatRole` — land later in the epic with the tool-orchestrator,
 *    an additive `messages`-element widening that needs no further bump.) Tools attach ONLY to the
 *    `population_generator` route, so the held-out judge / critic path never sees a tool — the rule-#6
 *    anchor (`ScoringPolicy` / `FinalJudgeRubric` / `FinalJudgeAxis`, incl. `immutableToAgents`) is
 *    BYTE-IDENTICAL across this bump.
 * Every bump is ADDITIVE + forward-compatible — old `schemaVersion` 1–9 envelopes still validate (the
 * contract accepts any positive int; the `≤ current` ceiling is the reader's job).
 */
export const CURRENT_SCHEMA_VERSION = 10;
