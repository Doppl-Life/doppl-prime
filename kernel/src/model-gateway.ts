import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ModelPurpose = 'problem_recovery' | 'candidate_generation' | 'critic_judgment' | string;

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

export type ModelCallRecord = {
  id: string;
  runId: string;
  purpose: ModelPurpose;
  provider: string;
  model: string;
  prompt: string;
  outputText: string;
  metadata: Record<string, unknown>;
};

export type ModelClient = {
  complete(request: ModelCallRequest): Promise<ModelCallRecord>;
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
  return fenced ? fenced[1]!.trim() : trimmed;
}

export function parseJsonObjectResponse(outputText: string): Record<string, unknown> {
  return ensureObject(JSON.parse(stripJsonFence(outputText)));
}

export function createReplayModelClient(
  records: ModelCallRecord[],
): ModelClient & { freshCalls(): number } {
  return {
    async complete(request) {
      const record = records.find(
        (candidate) =>
          candidate.runId === request.runId &&
          candidate.purpose === request.purpose &&
          candidate.prompt === request.prompt &&
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

export function createOpenRouterModelClient(input: OpenRouterModelClientInput): ModelClient {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
  const fetchImpl = input.fetch || globalThis.fetch;
  if (!fetchImpl) throw new Error('fetch is required to create an OpenRouter model client');
  const baseUrl = input.baseUrl || 'https://openrouter.ai/api/v1/chat/completions';

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
      const response = await fetchImpl(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: [{ role: 'user', content: request.prompt }],
          response_format: responseFormatFor(request),
          metadata: request.metadata,
        }),
      });
      if (!response.ok) {
        const body = response.text ? await response.text() : '';
        throw new Error(`openrouter request failed with ${response.status}: ${body}`);
      }
      return {
        id: `call_${request.runId}_${request.purpose}_${Date.now()}`,
        runId: request.runId,
        purpose: request.purpose,
        provider: 'openrouter',
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
