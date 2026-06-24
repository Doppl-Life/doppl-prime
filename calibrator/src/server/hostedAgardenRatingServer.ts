import { createServer, type IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import type { CalibratorIndex } from "../types";
import { createGitHubAgardenClientFromApp } from "./githubAgardenClient";
import { createHostedAgardenRatingHandler } from "./hostedAgardenRatingApi";
import { repoRoot } from "./vaultPaths";

const DEFAULT_ALLOWED_ORIGINS = ["https://doppl-life.github.io", "http://127.0.0.1:5178"];

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function allowedOrigins(): string[] {
  const raw = process.env.CALIBRATOR_ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  return new Request(url, { method: req.method, headers, body });
}

async function sendResponse(res: import("node:http").ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function createProductionHostedAgardenRatingHandler() {
  const indexPath = optionalEnv(
    "CALIBRATOR_INDEX_PATH",
    join(repoRoot, "calibrator/public/calibration-index.json"),
  );

  return createHostedAgardenRatingHandler({
    allowedOrigins: allowedOrigins(),
    async readIndex(): Promise<CalibratorIndex> {
      return JSON.parse(await readFile(indexPath, "utf8")) as CalibratorIndex;
    },
    createClient() {
      return createGitHubAgardenClientFromApp({
        owner: optionalEnv("AGARDEN_OWNER", "Doppl-Life"),
        repo: optionalEnv("AGARDEN_REPO", "agarden"),
        branch: optionalEnv("AGARDEN_BRANCH", "main"),
        appId: requiredEnv("GITHUB_APP_ID"),
        installationId: requiredEnv("GITHUB_APP_INSTALLATION_ID"),
        privateKey: requiredEnv("GITHUB_APP_PRIVATE_KEY"),
      });
    },
  });
}

export function startHostedAgardenRatingServer(port = Number(process.env.PORT || 8787)) {
  const handler = createProductionHostedAgardenRatingHandler();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
      if (req.method === "GET" && url.pathname === "/health") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, service: "doppl-calibrator-ratings" }));
        return;
      }
      if (url.pathname === "/api/agarden/ratings") {
        await sendResponse(res, await handler(await toRequest(req)));
        return;
      }
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }));
    }
  });

  server.listen(port, () => {
    console.log(`Doppl calibrator ratings API listening on ${port}`);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startHostedAgardenRatingServer();
}
