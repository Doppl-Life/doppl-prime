import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ModelPurpose = 'problem_recovery' | 'candidate_generation' | 'critic_judgment' | string;

export type ModelCallRequest = {
  runId: string;
  purpose: ModelPurpose;
  prompt: string;
  model: string;
  responseFormat?: 'json_object' | 'text';
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

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('model response must be a JSON object');
  }
  return value as Record<string, unknown>;
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
