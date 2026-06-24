import type { Plugin } from "vite";
import { defaultVaultRoot } from "./vaultPaths";
import { writeRatingMarkdown } from "./ratingWriter";
import { RatingSubmission } from "./vaultSchemas";
import { canSubmitRating } from "../reviewability";
import { readDefaultCalibratorIndex } from "./indexReader";

async function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function assertRateableTarget(submission: RatingSubmission): Promise<void> {
  const index = await readDefaultCalibratorIndex();
  if (index.source_kind === "agarden") {
    throw new Error("aGarden rating writes require the ratings-ledger writer, which is not wired yet.");
  }
  const caseItem = index.cases.find((item) => item.case_id === submission.case_id);
  if (!caseItem) throw new Error(`Unknown case_id "${submission.case_id}"`);

  const artifact =
    submission.rating_target === "problem_recovery"
      ? caseItem.problem_recoveries.find((item) => item.problem_recovery_id === submission.problem_recovery_id)
      : caseItem.solutions.find((item) => item.solution_id === submission.solution_id);

  if (!artifact) {
    throw new Error(`Unknown ${submission.rating_target} target for case "${submission.case_id}"`);
  }
  if (!canSubmitRating(artifact)) {
    throw new Error("Audit-only artifacts cannot be rated");
  }
}

export function createCalibratorDevApi(): Plugin {
  return {
    name: "calibrator-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.method === "GET" && req.url === "/api/index") {
            sendJson(res, 200, await readDefaultCalibratorIndex());
            return;
          }

          if (req.method === "POST" && req.url === "/api/ratings") {
            const body = await readJsonBody(req);
            const submission = RatingSubmission.parse(body);
            await assertRateableTarget(submission);
            const result = await writeRatingMarkdown({
              vaultRoot: defaultVaultRoot,
              submission,
            });
            sendJson(res, 201, { ratingId: result.ratingId, relativePath: result.relativePath });
            return;
          }
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : "Unknown error" });
          return;
        }

        next();
      });
    },
  };
}
