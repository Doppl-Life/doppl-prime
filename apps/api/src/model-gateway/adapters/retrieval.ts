import { readFileSync } from "node:fs";
import type { ModelGatewayRequest, ModelRoute } from "@doppl/contracts";
import { z } from "zod";
import { GatewayConfigError } from "../errors.js";
import type { Adapter, AdapterResult } from "../gateway.js";

/**
 * Retrieval / web-search adapter (P2.7). Tavily as primary; curated
 * corpus as the rehearsed fallback. Per ARCHITECTURE.md §9 results are
 * returned in `rawOutput` so the gateway dispatcher persists them into
 * the originating event — replay reads the saved results, never
 * re-queries Tavily.
 *
 * The corpus is hand-authored JSON checked into the repo. Lookup is a
 * case-insensitive substring match against `matchPattern`; first match
 * wins. No match returns `{source: "corpus", results: []}` — the kernel
 * can decide what to do.
 */

const RetrievalResultSchema = z
  .object({
    title: z.string(),
    content: z.string(),
    url: z.string(),
    score: z.number(),
  })
  .strict();

const CorpusSchema = z
  .object({
    queries: z.array(
      z
        .object({
          matchPattern: z.string().min(1),
          results: z.array(RetrievalResultSchema),
        })
        .strict(),
    ),
  })
  .strict();

type Corpus = z.infer<typeof CorpusSchema>;

export interface RetrievalAdapterOptions {
  env: { TAVILY_API_KEY?: string | undefined };
  corpusPath: string;
  fetchFn?: typeof fetch;
}

const TAVILY_URL = "https://api.tavily.com/search";

function loadCorpus(corpusPath: string): Corpus {
  let raw: string;
  try {
    raw = readFileSync(corpusPath, "utf8");
  } catch (e) {
    throw new GatewayConfigError(`Retrieval adapter: cannot read corpus at ${corpusPath}: ${e}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new GatewayConfigError(
      `Retrieval adapter: corpus at ${corpusPath} is not valid JSON: ${e}`,
    );
  }
  const result = CorpusSchema.safeParse(parsed);
  if (!result.success) {
    throw new GatewayConfigError(
      `Retrieval adapter: corpus at ${corpusPath} failed schema validation: ${result.error.errors[0]?.message ?? ""}`,
    );
  }
  return result.data;
}

function corpusLookup(corpus: Corpus, query: string): z.infer<typeof RetrievalResultSchema>[] {
  const lower = query.toLowerCase();
  for (const entry of corpus.queries) {
    if (lower.includes(entry.matchPattern.toLowerCase())) {
      return entry.results;
    }
  }
  return [];
}

function queryFromInput(input: unknown): string {
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.query === "string") return obj.query;
  }
  throw new GatewayConfigError("Retrieval adapter: request.input must be { query: string }");
}

async function callTavily(
  fetchFn: typeof fetch,
  apiKey: string,
  query: string,
): Promise<unknown[] | null> {
  let response: Response;
  try {
    response = await fetchFn(TAVILY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
    });
  } catch {
    return null; // network failure → fall back
  }
  if (!response.ok) return null; // 4xx/5xx → fall back
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  const obj = body as { results?: unknown[] };
  return obj.results ?? [];
}

export function createRetrievalAdapter(options: RetrievalAdapterOptions): Adapter {
  const corpus = loadCorpus(options.corpusPath);
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const tavilyKey = options.env.TAVILY_API_KEY ?? "";

  return {
    async invoke(_route: ModelRoute, request: ModelGatewayRequest): Promise<AdapterResult> {
      const query = queryFromInput(request.input);
      let source: "tavily" | "corpus" = "corpus";
      let results: unknown[] = [];

      if (tavilyKey !== "") {
        const tavilyResults = await callTavily(fetchFn, tavilyKey, query);
        if (tavilyResults !== null) {
          source = "tavily";
          results = tavilyResults;
        }
      }

      if (source === "corpus") {
        results = corpusLookup(corpus, query);
      }

      return {
        rawOutput: { source, results, query },
        energyEstimate: 1,
        energyActual: 1,
      };
    },
  };
}
