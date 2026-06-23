import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  RUN_EVENT_ACTORS,
  RUN_EVENT_SCHEMA_VERSION,
  RUN_EVENT_TYPES,
  type RunEvent,
  type RunEventActor,
} from './contracts.ts';

export type EventRecorder = {
  events: RunEvent[];
  push(type: string, payload: Record<string, unknown>, options?: EventRecorderPushOptions): RunEvent;
};

export type EventRecorderPushOptions = {
  actor?: RunEventActor;
  correlationId?: string;
  langfuseTraceId?: string;
  langfuseObservationId?: string;
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
  sequenceThrough: number;
  lastEventAt?: string;
};

export type ModelOutputCounts = {
  started: number;
  accepted: number;
  repairRequested: number;
  repaired: number;
  rejected: number;
};

export type ModelOutputProjection = ModelOutputCounts & {
  byPurpose: Record<string, ModelOutputCounts>;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function actorForEventType(type: string): RunEventActor {
  if (type.startsWith('critic.')) return 'critic';
  if (type.startsWith('fitness.') || type.startsWith('pair.') || type === 'candidate.fused') {
    return 'selection_controller';
  }
  if (type.startsWith('knowledge.') || type.startsWith('model.')) return 'system';
  if (type.startsWith('candidate.')) return 'agenome';
  return 'runtime';
}

function payloadRunId(payload: Record<string, unknown>): string | undefined {
  return stringValue(payload.runId);
}

function payloadGenerationId(payload: Record<string, unknown>): string | undefined {
  return stringValue(payload.generationId) ?? numberValue(payload.generation)?.toString();
}

function payloadCandidateId(payload: Record<string, unknown>): string | undefined {
  return stringValue(payload.candidateId) ?? stringValue(payload.childId);
}

function payloadAgenomeId(payload: Record<string, unknown>): string | undefined {
  return stringValue(payload.agenomeId);
}

export function normalizeRunEvent(event: RunEvent, defaultRunId?: string): RunEvent {
  const sequence = event.sequence ?? event.index;
  const runId = event.runId ?? payloadRunId(event.payload) ?? defaultRunId;
  const id = event.id ?? `evt_${sanitizeIdentifier(runId || 'unknown')}_${sequence}`;
  const actor =
    event.actor && RUN_EVENT_ACTORS.includes(event.actor) ? event.actor : actorForEventType(event.type);
  return {
    ...event,
    id,
    runId,
    generationId: event.generationId ?? payloadGenerationId(event.payload),
    agenomeId: event.agenomeId ?? payloadAgenomeId(event.payload),
    candidateId: event.candidateId ?? payloadCandidateId(event.payload),
    sequence,
    occurredAt: event.occurredAt ?? new Date(0).toISOString(),
    actor,
    schemaVersion: event.schemaVersion ?? RUN_EVENT_SCHEMA_VERSION,
  };
}

export function createMemoryEventRecorder(seedEvents: RunEvent[] = [], runId?: string): EventRecorder {
  const events = seedEvents.map((event) => normalizeRunEvent(event, runId));
  let activeRunId = runId ?? events.find((event) => event.runId)?.runId;
  return {
    events,
    push(type: string, payload: Record<string, unknown>, options: EventRecorderPushOptions = {}) {
      const sequence = events.length;
      activeRunId = payloadRunId(payload) ?? activeRunId;
      const event = normalizeRunEvent(
        {
          index: sequence,
          id: `evt_${sanitizeIdentifier(activeRunId || 'pending')}_${sequence}`,
          runId: activeRunId,
          type,
          sequence,
          occurredAt: new Date().toISOString(),
          actor: options.actor ?? actorForEventType(type),
          correlationId: options.correlationId,
          langfuseTraceId: options.langfuseTraceId,
          langfuseObservationId: options.langfuseObservationId,
          payload,
          schemaVersion: RUN_EVENT_SCHEMA_VERSION,
        },
        activeRunId,
      );
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
  const parsed = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RunEvent);
  const firstRunEvent = parsed.find((event) => event.runId || payloadRunId(event.payload));
  const defaultRunId = firstRunEvent?.runId ?? (firstRunEvent ? payloadRunId(firstRunEvent.payload) : undefined);
  return parsed.map((event) => normalizeRunEvent(event, defaultRunId));
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
  return { started: 0, accepted: 0, repairRequested: 0, repaired: 0, rejected: 0 };
}

function modelOutputBucket(type: string): keyof ModelOutputCounts | undefined {
  if (type === 'model.operation_started') return 'started';
  if (type === 'model.output_accepted') return 'accepted';
  if (type === 'model.output_repair_requested') return 'repairRequested';
  if (type === 'model.output_repaired') return 'repaired';
  if (type === 'model.output_rejected') return 'rejected';
  return undefined;
}

export function replayRunProjection(events: RunEvent[]): RunProjection {
  const normalizedEvents = events.map((event) => normalizeRunEvent(event));
  const projection: RunProjection = {
    candidateIds: [],
    fitnessTotals: {},
    modelOutputs: { ...emptyModelOutputCounts(), byPurpose: {} },
    completed: false,
    eventCount: normalizedEvents.length,
    sequenceThrough: normalizedEvents.length
      ? Math.max(...normalizedEvents.map((event) => event.sequence ?? event.index))
      : -1,
  };

  for (const event of normalizedEvents) {
    projection.runId = event.runId || projection.runId;
    projection.lastEventAt = event.occurredAt || projection.lastEventAt;
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

export function knownRunEventTypes(): string[] {
  return [...RUN_EVENT_TYPES];
}
