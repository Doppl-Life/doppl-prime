import { z } from "zod";

export const AgardenScores = z
  .object({
    judge: z.number().nullable().optional(),
    human: z.number().nullable().optional(),
    n: z.number().int().min(0).optional(),
  })
  .default({ human: null, n: 0 });

export const AgardenNodeFrontmatter = z.object({
  id: z.string().min(1),
  stage: z.enum(["case_study", "problem_recovery", "doppl"]),
  name: z.string().min(1).optional(),
  kernel: z.string().min(1).optional(),
  temporal: z.boolean().optional(),
  next: z.string().nullable().optional(),
  scores: AgardenScores.optional(),
  doppelgangers: z.number().optional(),
});

export type AgardenNodeFrontmatter = z.infer<typeof AgardenNodeFrontmatter>;
