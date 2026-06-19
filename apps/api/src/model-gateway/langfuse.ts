import { randomUUID } from "node:crypto";
import type { GatewayLangfuse, TraceHandle } from "./gateway.js";

/**
 * Langfuse correlation with a local-trace fallback (P2.8). Per
 * ARCHITECTURE.md §14, Langfuse is an observed-only side channel; the
 * persisted event is the source of truth. Correlation IDs always flow
 * back to the caller — either from the Cloud SDK or from a local UUID
 * generator — so a downstream replay can match.
 *
 * Default posture during dev is **local-trace** — no external account
 * needed. `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` opt in to
 * Cloud mode. `DOPPL_LANGFUSE_INCLUDE_CONTENT=true` toggles whether
 * prompt + completion content reaches Langfuse spans (default off —
 * only metadata + IDs).
 *
 * The SDK is wrapped: any Cloud-side throw silently falls back to
 * local-trace IDs so a Langfuse outage never blocks a gateway call.
 */

interface LangfuseSDKLike {
  trace: (opts: Record<string, unknown>) => { id: string };
  span: (opts: Record<string, unknown>) => {
    id: string;
    end: (opts?: Record<string, unknown>) => Promise<void> | void;
  };
  shutdown: () => Promise<void> | void;
}

export interface LangfuseClientOptions {
  env: {
    LANGFUSE_PUBLIC_KEY?: string | undefined;
    LANGFUSE_SECRET_KEY?: string | undefined;
    LANGFUSE_HOST?: string | undefined;
    DOPPL_LANGFUSE_INCLUDE_CONTENT?: string | undefined;
  };
  /** Injected SDK factory for tests. Production lazily imports `langfuse`. */
  sdkFactory?: () => LangfuseSDKLike;
}

const CONTENT_KEYS = new Set(["prompt", "completion", "messages", "content"]);

function stripContent(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(metadata)) {
    if (CONTENT_KEYS.has(key)) continue;
    out[key] = metadata[key];
  }
  return out;
}

function localTraceHandle(): TraceHandle {
  return {
    traceId: randomUUID(),
    observationId: randomUUID(),
    end: async () => {},
  };
}

export function createLangfuseClient(options: LangfuseClientOptions): GatewayLangfuse {
  const publicKey = options.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = options.env.LANGFUSE_SECRET_KEY;
  const includeContent = options.env.DOPPL_LANGFUSE_INCLUDE_CONTENT === "true";

  // Local-trace fallback mode.
  if (!publicKey || !secretKey) {
    return {
      startTrace: () => localTraceHandle(),
    };
  }

  // Cloud mode. Lazily construct the SDK; any throw falls back silently.
  let sdk: LangfuseSDKLike | undefined;
  try {
    if (options.sdkFactory) {
      sdk = options.sdkFactory();
    } else {
      // The real `langfuse` SDK import happens only when keys are set, so
      // local-trace mode never pulls the dep in. We lazy-require to keep
      // construction failures isolated.
      // biome-ignore lint/correctness/noUnusedVariables: production wires the SDK here when implemented
      const lazyImportPlaceholder = null;
      throw new Error(
        "langfuse SDK factory not supplied — pass `sdkFactory` (Phase 2 leaves the production wiring to caller config)",
      );
    }
  } catch {
    return { startTrace: () => localTraceHandle() };
  }

  const client = sdk;
  return {
    startTrace(opts) {
      const metadata = opts.metadata ?? {};
      const filtered = includeContent ? metadata : stripContent(metadata);
      try {
        const trace = client.trace({
          name: opts.name,
          userId: opts.runId,
          sessionId: opts.correlationId,
          metadata: filtered,
        });
        const observation = client.span({
          traceId: trace.id,
          name: opts.name,
          input: filtered,
        });
        return {
          traceId: trace.id,
          observationId: observation.id,
          async end(result) {
            try {
              await observation.end({
                output: includeContent
                  ? { tokensUsed: result.tokensUsed, error: result.error }
                  : { success: result.success, tokensUsed: result.tokensUsed },
                level: result.success ? "DEFAULT" : "ERROR",
              });
            } catch {
              // Langfuse flush failure is observed-only; never blocks the caller.
            }
          },
        };
      } catch {
        return localTraceHandle();
      }
    },
  };
}
