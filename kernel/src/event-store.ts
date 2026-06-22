import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RunEvent } from './contracts.ts';

export type EventRecorder = {
  events: RunEvent[];
  push(type: string, payload: Record<string, unknown>): RunEvent;
};

export type RunProjection = {
  runId?: string;
  caseId?: string;
  packetId?: string;
  recoveryId?: string;
  candidateIds: string[];
  fitnessTotals: Record<string, number>;
  modelOutputs: ModelOutputProjection;
  childId?: string;
  completed: boolean;
  eventCount: number;
};

export type ModelOutputCounts = {
  accepted: number;
  repairRequested: number;
  repaired: number;
  rejected: number;
};

export type ModelOutputProjection = ModelOutputCounts & {
  byPurpose: Record<string, ModelOutputCounts>;
};

export function createMemoryEventRecorder(seedEvents: RunEvent[] = []): EventRecorder {
  const events = [...seedEvents];
  return {
    events,
    push(type: string, payload: Record<string, unknown>) {
      const event = { index: events.length, type, payload };
      events.push(event);
      return event;
    },
  };
}

function serializeEvent(event: RunEvent): string {
  return `${JSON.stringify(event)}\n`;
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function writeRunEvents(filePath: string, events: RunEvent[]): Promise<void> {
  await ensureParentDir(filePath);
  await writeFile(filePath, events.map(serializeEvent).join(''), 'utf8');
}

export async function appendRunEvent(filePath: string, event: RunEvent): Promise<void> {
  await ensureParentDir(filePath);
  await appendFile(filePath, serializeEvent(event), 'utf8');
}

export async function readRunEvents(filePath: string): Promise<RunEvent[]> {
  const raw = await readFile(filePath, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RunEvent);
}

function stringPayloadValue(event: RunEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === 'string' ? value : undefined;
}

function numberPayloadValue(event: RunEvent, key: string): number | undefined {
  const value = event.payload[key];
  return typeof value === 'number' ? value : undefined;
}

function emptyModelOutputCounts(): ModelOutputCounts {
  return { accepted: 0, repairRequested: 0, repaired: 0, rejected: 0 };
}

function modelOutputBucket(type: string): keyof ModelOutputCounts | undefined {
  if (type === 'model.output_accepted') return 'accepted';
  if (type === 'model.output_repair_requested') return 'repairRequested';
  if (type === 'model.output_repaired') return 'repaired';
  if (type === 'model.output_rejected') return 'rejected';
  return undefined;
}

export function replayRunProjection(events: RunEvent[]): RunProjection {
  const projection: RunProjection = {
    candidateIds: [],
    fitnessTotals: {},
    modelOutputs: { ...emptyModelOutputCounts(), byPurpose: {} },
    completed: false,
    eventCount: events.length,
  };

  for (const event of events) {
    if (event.type === 'run.started') {
      projection.runId = stringPayloadValue(event, 'runId');
      projection.caseId = stringPayloadValue(event, 'caseId');
    }
    if (event.type === 'knowledge.packet_selected') {
      projection.packetId = stringPayloadValue(event, 'packetId');
    }
    if (event.type === 'problem_recovery.created') {
      projection.recoveryId = stringPayloadValue(event, 'recoveryId');
    }
    if (event.type === 'candidate.created') {
      const candidateId = stringPayloadValue(event, 'candidateId');
      if (candidateId) projection.candidateIds.push(candidateId);
    }
    if (event.type === 'fitness.scored') {
      const candidateId = stringPayloadValue(event, 'candidateId');
      const total = numberPayloadValue(event, 'total');
      if (candidateId && total !== undefined) projection.fitnessTotals[candidateId] = total;
    }
    if (event.type === 'candidate.fused') {
      projection.childId = stringPayloadValue(event, 'childId');
    }
    const modelBucket = modelOutputBucket(event.type);
    if (modelBucket) {
      const purpose = stringPayloadValue(event, 'purpose') || 'unknown';
      projection.modelOutputs[modelBucket] += 1;
      projection.modelOutputs.byPurpose[purpose] ||= emptyModelOutputCounts();
      projection.modelOutputs.byPurpose[purpose][modelBucket] += 1;
    }
    if (event.type === 'run.completed') {
      projection.runId = stringPayloadValue(event, 'runId') || projection.runId;
      projection.childId = stringPayloadValue(event, 'childId') || projection.childId;
      projection.completed = true;
    }
  }

  return projection;
}
