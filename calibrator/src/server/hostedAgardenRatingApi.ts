import { z } from "zod";
import type { CalibratorIndex } from "../types";
import type { GitAgardenClient } from "./githubAgardenWriter";
import { writeGithubAgardenRating } from "./githubAgardenWriter";
import { RatingSubmission } from "./vaultSchemas";

export interface HostedAgardenRatingApiConfig {
  readIndex(): Promise<CalibratorIndex>;
  createClient(): Promise<GitAgardenClient> | GitAgardenClient;
  allowedOrigins?: string[];
  authToken?: string;
  requireAuth?: boolean;
  now?: () => Date;
}

function jsonResponse(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function corsHeaders(request: Request, allowedOrigins: string[] = []): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, idempotency-key, authorization",
    vary: "Origin",
  };
}

function errorStatus(error: unknown): number {
  if (error instanceof z.ZodError) return 400;
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (status >= 400 && status < 500) return status;
  }
  if (error instanceof Error) {
    if (
      /unknown|missing|required|mismatch|allow-listed|non-primary|cannot be rated|invalid/i.test(error.message)
    ) {
      return 400;
    }
  }
  return 500;
}

function errorMessage(error: unknown, status: number): string {
  if (error instanceof z.ZodError) return error.issues.map((issue) => issue.message).join("; ");
  if (status >= 500) return "Rating submission failed";
  return error instanceof Error ? error.message : "Rating submission failed";
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function authFailure(
  config: HostedAgardenRatingApiConfig,
  request: Request,
): { body: unknown; status: number; headers?: HeadersInit } | null {
  if (!config.requireAuth) return null;
  if (!config.authToken) {
    return { body: { error: "Hosted ratings auth is not configured" }, status: 503 };
  }
  if (bearerToken(request) !== config.authToken) {
    return {
      body: { error: "Unauthorized" },
      status: 401,
      headers: { "www-authenticate": 'Bearer realm="doppl-calibrator-ratings"' },
    };
  }
  return null;
}

export function createHostedAgardenRatingHandler(config: HostedAgardenRatingApiConfig) {
  return async function handleHostedAgardenRating(request: Request): Promise<Response> {
    const headers = corsHeaders(request, config.allowedOrigins);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }

    const unauthorized = authFailure(config, request);
    if (unauthorized) {
      return jsonResponse(unauthorized.body, unauthorized.status, { ...headers, ...unauthorized.headers });
    }

    try {
      const body = await request.json();
      const submission = RatingSubmission.parse(body);
      const [index, client] = await Promise.all([config.readIndex(), config.createClient()]);
      if (index.source_kind !== "agarden") {
        throw new Error("Hosted ratings require an aGarden index");
      }
      const result = await writeGithubAgardenRating({
        client,
        index,
        submission,
        now: config.now?.(),
      });
      return jsonResponse(result, 201, headers);
    } catch (error) {
      const status = errorStatus(error);
      return jsonResponse({ error: errorMessage(error, status) }, status, headers);
    }
  };
}
