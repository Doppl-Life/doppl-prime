import type { Plugin } from "vite";
import { readVaultIndex } from "./vaultReader";
import { defaultVaultRoot } from "./vaultPaths";
import { writeRatingMarkdown } from "./ratingWriter";
import { RatingSubmission } from "./vaultSchemas";

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

export function createCalibratorDevApi(): Plugin {
  return {
    name: "calibrator-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.method === "GET" && req.url === "/api/index") {
            sendJson(res, 200, await readVaultIndex(defaultVaultRoot));
            return;
          }

          if (req.method === "POST" && req.url === "/api/ratings") {
            const body = await readJsonBody(req);
            const submission = RatingSubmission.parse(body);
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
