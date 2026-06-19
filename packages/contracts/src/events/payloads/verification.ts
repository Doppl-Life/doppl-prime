import { z } from "zod";
import { CheckResult } from "../../checks/check-result.js";
import { CandidateIdea } from "../../domain/candidate-idea.js";
import { CriticReview } from "../../verifier/critic-review.js";

export const CandidateCreatedPayload = z.object({ candidate: CandidateIdea }).strict();

export const CriticReviewedPayload = z.object({ review: CriticReview }).strict();

export const CheckCompletedPayload = z.object({ result: CheckResult }).strict();
