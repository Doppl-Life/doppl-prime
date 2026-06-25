import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CalibratorIndex,
  CalibratorProblemRecovery,
  CalibratorSolution,
} from "../src/types";
import { reviewMode } from "../src/reviewability";
import { repoRoot } from "../src/server/vaultPaths";

type SmokeTarget =
  | { rating_target: "problem_recovery"; artifact: CalibratorProblemRecovery }
  | { rating_target: "solution"; artifact: CalibratorSolution };

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function skip(message: string): never {
  console.log(`SKIP hosted ratings smoke: ${message}`);
  process.exit(0);
}

function fail(message: string): never {
  console.error(`FAIL hosted ratings smoke: ${message}`);
  process.exit(1);
}

async function readIndex(): Promise<CalibratorIndex> {
  const indexPath = env("CALIBRATOR_SMOKE_INDEX_PATH") || join(repoRoot, "calibrator/public/calibration-index.json");
  return JSON.parse(await readFile(indexPath, "utf8")) as CalibratorIndex;
}

function firstPrimaryTarget(index: CalibratorIndex): SmokeTarget | null {
  const requestedNodeId = env("CALIBRATOR_SMOKE_TARGET_NODE_ID");
  for (const caseItem of index.cases) {
    for (const artifact of caseItem.problem_recoveries) {
      if (reviewMode(artifact) === "primary" && (!requestedNodeId || artifact.node_id === requestedNodeId)) {
        return { rating_target: "problem_recovery", artifact };
      }
    }
    for (const artifact of caseItem.solutions) {
      if (reviewMode(artifact) === "primary" && (!requestedNodeId || artifact.node_id === requestedNodeId)) {
        return { rating_target: "solution", artifact };
      }
    }
  }
  return null;
}

function smokePayload(target: SmokeTarget) {
  const reviewer = env("CALIBRATOR_SMOKE_REVIEWER_EMAIL") || "dalton.dinderman@challenger.gauntletai.com";
  const score = Number(env("CALIBRATOR_SMOKE_SCORE") || "0");
  const nodeId = target.artifact.node_id;
  if (!nodeId) fail("selected artifact has no node_id");
  if (!Number.isInteger(score) || score < -5 || score > 5) {
    fail("CALIBRATOR_SMOKE_SCORE must be an integer from -5 to +5");
  }

  const base = {
    case_id: target.artifact.case_id,
    rating_target: target.rating_target,
    node_id: nodeId,
    score,
    notes: "Hosted ratings smoke test. Safe branch only.",
    reviewer_email: reviewer,
  };

  if (target.rating_target === "problem_recovery") {
    return {
      ...base,
      problem_recovery_id: target.artifact.problem_recovery_id,
    };
  }
  return {
    ...base,
    solution_id: target.artifact.solution_id,
  };
}

async function main() {
  const endpoint = env("CALIBRATOR_HOSTED_RATINGS_URL");
  const accessCode = env("CALIBRATOR_HOSTED_RATINGS_ACCESS_CODE");
  if (!endpoint) skip("set CALIBRATOR_HOSTED_RATINGS_URL to run it");
  if (env("CALIBRATOR_SMOKE_ALLOW_WRITE") !== "true") {
    skip("set CALIBRATOR_SMOKE_ALLOW_WRITE=true after confirming Railway targets the safe smoke branch");
  }

  const index = await readIndex();
  if (index.source_kind !== "agarden") fail("smoke requires an aGarden index");
  const target = firstPrimaryTarget(index);
  if (!target) fail("no primary aGarden review target found");
  const payload = smokePayload(target);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessCode ? { authorization: `Bearer ${accessCode}` } : {}),
      "idempotency-key": `hosted-smoke:${payload.node_id}:${payload.reviewer_email}`,
      origin: "https://doppl-life.github.io",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`HTTP ${response.status}: ${typeof body.error === "string" ? body.error : response.statusText}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        status: response.status,
        ratingId: body.ratingId,
        commitSha: body.commitSha,
        ledgerPath: body.ledgerPath ?? body.relativePath,
        nodePath: body.nodePath,
        scores: body.scores,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
