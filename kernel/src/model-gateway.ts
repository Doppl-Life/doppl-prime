import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ModelCallRecord, ModelPurpose } from './contracts.ts';

// Re-export so callers keep importing these provenance types from the gateway boundary.
export type { ModelCallRecord, ModelPurpose };

export type ModelCallRequest = {
  runId: string;
  purpose: ModelPurpose;
  prompt: string;
  model: string;
  responseFormat?: 'json_object' | 'text';
  responseSchema?: {
    name: string;
    schema: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
};

export type ModelClient = {
  complete(request: ModelCallRequest): Promise<ModelCallRecord>;
};

export type ReplayModelClientOptions = {
  sourceRunId?: string;
  targetRunId?: string;
};

export type RecordingModelClient = ModelClient & {
  records: ModelCallRecord[];
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  text?(): Promise<string>;
};

type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<FetchResponseLike>;

export type OpenRouterModelClientInput = {
  apiKey: string;
  fetch?: FetchLike;
  baseUrl?: string;
};

export type OpenAICompatibleInput = {
  baseUrl: string;
  apiKey?: string;
  provider?: string;
  fetch?: FetchLike;
};

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('model response must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function outputTextFromChatCompletion(value: unknown): string {
  const response = ensureObject(value);
  const choices = response.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('openrouter response.choices must contain at least one choice');
  }
  const firstChoice = ensureObject(choices[0]);
  const message = ensureObject(firstChoice.message);
  if (typeof message.content !== 'string') {
    throw new Error('openrouter response choice message.content must be a string');
  }
  return message.content;
}

function stripJsonFence(outputText: string): string {
  const trimmed = outputText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function parseJsonObjectResponse(outputText: string): Record<string, unknown> {
  return ensureObject(JSON.parse(stripJsonFence(outputText)));
}

function replayPrompt(prompt: string, options: ReplayModelClientOptions): string {
  if (!options.sourceRunId || !options.targetRunId || options.sourceRunId === options.targetRunId) {
    return prompt;
  }
  return prompt.split(options.targetRunId).join(options.sourceRunId);
}

export function createReplayModelClient(
  records: ModelCallRecord[],
  options: ReplayModelClientOptions = {},
): ModelClient & { freshCalls(): number } {
  return {
    async complete(request) {
      const sourceRunId = options.sourceRunId || request.runId;
      const prompt = replayPrompt(request.prompt, options);
      const record = records.find(
        (candidate) =>
          candidate.runId === sourceRunId &&
          candidate.purpose === request.purpose &&
          candidate.prompt === prompt &&
          candidate.model === request.model,
      );
      if (!record) {
        throw new Error(`no replay model call for ${request.runId}:${request.purpose}`);
      }
      return record;
    },
    freshCalls() {
      return 0;
    },
  };
}

export function createRecordingModelClient(client: ModelClient): RecordingModelClient {
  const records: ModelCallRecord[] = [];
  return {
    records,
    async complete(request) {
      const record = await client.complete(request);
      records.push(record);
      return record;
    },
  };
}

// OpenAI-compatible /chat/completions client. One implementation covers every provider that speaks
// the OpenAI chat API — OpenRouter, Groq, OpenAI, LM Studio, and Ollama (via its /v1 endpoint).
// A provider is just a base URL (+ optional key); local providers need no key.
export function createOpenAICompatibleModelClient(input: OpenAICompatibleInput): ModelClient {
  const fetchImpl = input.fetch || globalThis.fetch;
  const apiKey = input.apiKey?.trim() || '';
  const provider = input.provider || 'openai-compatible';
  const baseUrl = input.baseUrl;

  function responseFormatFor(request: ModelCallRequest): Record<string, unknown> | undefined {
    if (request.responseSchema) {
      return {
        type: 'json_schema',
        json_schema: {
          name: request.responseSchema.name,
          strict: true,
          schema: request.responseSchema.schema,
        },
      };
    }
    return request.responseFormat === 'json_object' ? { type: 'json_object' } : undefined;
  }

  return {
    async complete(request) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const response = await fetchImpl(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: request.model,
          messages: [{ role: 'user', content: request.prompt }],
          response_format: responseFormatFor(request),
          metadata: request.metadata,
        }),
      });
      if (!response.ok) {
        const body = response.text ? await response.text() : '';
        throw new Error(`${provider} request failed with ${response.status}: ${body}`);
      }
      return {
        id: `call_${request.runId}_${request.purpose}_${Date.now()}`,
        runId: request.runId,
        purpose: request.purpose,
        provider,
        model: request.model,
        prompt: request.prompt,
        outputText: outputTextFromChatCompletion(await response.json()),
        metadata: {
          requestId: response.headers?.get('x-request-id') || null,
        },
      };
    },
  };
}

// Base URLs for the OpenAI-compatible providers the spike supports. Local providers (lmstudio,
// ollama) accept calls with no API key.
export const OPENAI_COMPATIBLE_PRESETS = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  lmstudio: 'http://localhost:1234/v1/chat/completions',
  ollama: 'http://localhost:11434/v1/chat/completions',
} as const;

export type OpenAICompatibleProvider = keyof typeof OPENAI_COMPATIBLE_PRESETS;

export const LOCAL_PROVIDERS: ReadonlySet<OpenAICompatibleProvider> = new Set(['lmstudio', 'ollama']);

// Build a client for a named preset. Hosted providers require a key; local ones don't.
export function createPresetModelClient(
  provider: OpenAICompatibleProvider,
  options: { apiKey?: string; fetch?: FetchLike } = {},
): ModelClient {
  return createOpenAICompatibleModelClient({
    baseUrl: OPENAI_COMPATIBLE_PRESETS[provider],
    apiKey: options.apiKey,
    provider,
    fetch: options.fetch,
  });
}

export function createOpenRouterModelClient(input: OpenRouterModelClientInput): ModelClient {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
  return createOpenAICompatibleModelClient({
    baseUrl: input.baseUrl || OPENAI_COMPATIBLE_PRESETS.openrouter,
    apiKey,
    provider: 'openrouter',
    fetch: input.fetch,
  });
}

// Per-role routing: pick the model by the call's purpose, falling back to the request's model.
// Pin the judge by routing 'critic_judgment' to a fixed model so scores stay comparable.
export function createRoutingModelClient(
  client: ModelClient,
  modelByPurpose: Record<string, string>,
): ModelClient {
  return {
    async complete(request) {
      const model = modelByPurpose[request.purpose];
      return client.complete(model ? { ...request, model } : request);
    },
  };
}

export type FusionModelClientInput = {
  client: ModelClient;
  models: string[];
  synthesisModel?: string;
};

// Fusion: run the same task across several models in parallel, then make one synthesis call that
// fuses their drafts into a single best response in the requested format. Composes over any
// ModelClient, so "OpenRouter fusion" is this wrapping an OpenRouter client.
export function createFusionModelClient(input: FusionModelClientInput): ModelClient {
  const { client, models } = input;
  if (models.length < 2) throw new Error('fusion requires at least two models');
  const synthesisModel = input.synthesisModel ?? models[0];
  if (!synthesisModel) throw new Error('fusion requires a synthesis model');
  return {
    async complete(request) {
      const drafts = await Promise.all(
        models.map((model) =>
          client.complete({ ...request, model, purpose: `${request.purpose}:fusion_draft` }),
        ),
      );
      const synthesisPrompt = [
        'Several expert models independently produced answers to the same task.',
        'Fuse them into one superior answer: keep the strongest, best-grounded ideas and drop weak ones.',
        'Return the SAME format the original task requested.',
        '',
        '## Original task',
        request.prompt,
        '',
        ...drafts.map((draft, index) => `## Draft ${index + 1} (${draft.model})\n${draft.outputText}`),
      ].join('\n');
      const fused = await client.complete({
        ...request,
        model: synthesisModel,
        prompt: synthesisPrompt,
        purpose: `${request.purpose}:fusion_synthesis`,
      });
      return {
        ...fused,
        purpose: request.purpose,
        provider: `fusion:${fused.provider}`,
        prompt: request.prompt,
        metadata: {
          ...fused.metadata,
          fusionModels: models,
          fusionDraftIds: drafts.map((draft) => draft.id),
        },
      };
    },
  };
}

function serializeRecord(record: ModelCallRecord): string {
  return `${JSON.stringify(record)}\n`;
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function writeModelCallRecords(
  filePath: string,
  records: ModelCallRecord[],
): Promise<void> {
  await ensureParentDir(filePath);
  await writeFile(filePath, records.map(serializeRecord).join(''), 'utf8');
}

export async function readModelCallRecords(filePath: string): Promise<ModelCallRecord[]> {
  const raw = await readFile(filePath, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ModelCallRecord);
}
