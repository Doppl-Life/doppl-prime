import { z } from "zod";

/**
 * CheckRunnerAdapter — the allowlist-keyed, non-executing adapter shape.
 *
 * The schema deliberately exposes NO `execute`, `command`, `run`, or `eval`
 * field. An unregistered or execution-requiring adapter id is meant to
 * map to a `skipped` CheckResult at runtime, never to silent code
 * execution (ARCHITECTURE.md §7/§14, REQ-S-003). The §2.5 snapshot test
 * asserts the field-name set excludes any exec-shaped name; adding one
 * would break the snapshot, which is the intended alarm.
 *
 * The actual adapter registry lives in apps/api/check-runners (Phase 4);
 * this is just the per-adapter contract.
 */
export const CheckRunnerAdapter = z
  .object({
    id: z.string().min(1),
    checkType: z.string().min(1),
    capabilities: z.array(z.string()),
    description: z.string(),
  })
  .strict();
export type CheckRunnerAdapter = z.infer<typeof CheckRunnerAdapter>;
