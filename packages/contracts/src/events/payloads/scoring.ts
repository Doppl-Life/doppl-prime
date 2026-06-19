import { z } from "zod";
import { CullingEvent } from "../../domain/culling-event.js";
import { FitnessScore } from "../../scoring/fitness-score.js";
import { NoveltyScore } from "../../scoring/novelty-score.js";

export const NoveltyScoredPayload = z.object({ novelty: NoveltyScore }).strict();

export const FitnessScoredPayload = z.object({ fitness: FitnessScore }).strict();

export const LineageCulledPayload = z.object({ culling: CullingEvent }).strict();
