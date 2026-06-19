import { z } from "zod";

/**
 * Closed 7-role actor union. Every event envelope carries exactly one of
 * these roles; any other value is rejected at the envelope boundary
 * (ARCHITECTURE.md §4, IMPLEMENTATION_PLAN.md P0.1).
 */
export const ActorRoles = [
  "operator",
  "runtime",
  "agenome",
  "critic",
  "check_runner",
  "selection_controller",
  "system",
] as const;

export const Actor = z.enum(ActorRoles);
export type Actor = z.infer<typeof Actor>;
