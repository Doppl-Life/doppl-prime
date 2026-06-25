import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { toDashboardEnvelope } from './dashboard-envelope.ts';
import { readRunEvents, replayRunProjection } from './event-store.ts';
import { headerValue, type KernelHttpRequest, type KernelHttpResponse } from './server-http.ts';

export async function findRunDir(rootDir: string, runId: string): Promise<string | undefined> {
  const caseEntries = await readdir(rootDir, { withFileTypes: true });
  for (const caseEntry of caseEntries) {
    if (!caseEntry.isDirectory()) continue;
    const runDir = path.join(rootDir, caseEntry.name, runId);
    try {
      await readFile(path.join(runDir, 'run-index.json'), 'utf8');
      return runDir;
    } catch {
      try {
        await readFile(path.join(runDir, 'events.jsonl'), 'utf8');
        return runDir;
      } catch {
        // Keep looking through case directories.
      }
    }
  }
  return undefined;
}

export async function readRunIndex(runId: string, rootDir: string): Promise<Record<string, unknown>> {
  const runDir = await findRunDir(rootDir, runId);
  if (!runDir) throw new Error(`run not found: ${runId}`);
  try {
    return JSON.parse(await readFile(path.join(runDir, 'run-index.json'), 'utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    const events = await readRunEvents(path.join(runDir, 'events.jsonl'));
    const projection = replayRunProjection(events);
    return {
      artifact_type: 'partial_run_index',
      runId,
      caseId: projection.caseId ?? null,
      status: projection.completed ? 'completed' : 'running',
      dashboardEvents: events,
      eventCount: projection.eventCount,
      sequenceThrough: projection.sequenceThrough,
    };
  }
}

export async function replayModelCallsPathForRun(runId: string, rootDir: string): Promise<string> {
  const runDir = await findRunDir(rootDir, runId);
  if (!runDir) throw new Error(`replay source run not found: ${runId}`);
  const index = await readRunIndex(runId, rootDir);
  const trace = index.trace as { modelCallsPath?: unknown } | undefined;
  if (!trace || typeof trace.modelCallsPath !== 'string') {
    throw new Error(`replay source run has no model-call log: ${runId}`);
  }
  return path.join(runDir, safeArtifactPath(trace.modelCallsPath));
}

export function safeArtifactPath(rawArtifactPath: string): string {
  const decoded = decodeURIComponent(rawArtifactPath);
  const normalized = path.normalize(decoded);
  if (path.isAbsolute(normalized) || normalized.startsWith('..') || normalized.includes('/../')) {
    throw new Error('artifact path is invalid');
  }
  return normalized;
}

export async function readRunArtifact(
  runId: string,
  rootDir: string,
  rawArtifactPath: string,
): Promise<Record<string, unknown>> {
  const runDir = await findRunDir(rootDir, runId);
  if (!runDir) throw new Error(`run not found: ${runId}`);
  const artifactPath = safeArtifactPath(rawArtifactPath);
  const absoluteArtifactPath = path.join(runDir, artifactPath);
  const relative = path.relative(runDir, absoluteArtifactPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('artifact path is invalid');
  }
  return {
    runId,
    artifactPath,
    content: await readFile(absoluteArtifactPath, 'utf8'),
  };
}

export async function readDashboardEvents(runId: string, rootDir: string): Promise<Array<Record<string, unknown>>> {
  try {
    return await readRunEventLog(runId, rootDir);
  } catch {
    return [];
  }
}

export async function readRunEventLog(runId: string, rootDir: string) {
  const runDir = await findRunDir(rootDir, runId);
  if (!runDir) throw new Error(`run not found: ${runId}`);
  return readRunEvents(path.join(runDir, 'events.jsonl'));
}

export function eventSequence(event: { sequence?: number; index?: number }): number {
  return event.sequence ?? event.index ?? -1;
}

export function eventsAfter<T extends { sequence?: number; index?: number }>(
  events: T[],
  afterSequence: number,
): T[] {
  return events.filter((event) => eventSequence(event) > afterSequence);
}

export function lastEventIdFromRequest(request: KernelHttpRequest, url: URL): number {
  const rawQueryAfter = url.searchParams.get('after') ?? url.searchParams.get('afterSequence');
  if (rawQueryAfter !== null) {
    const queryAfter = Number(rawQueryAfter);
    if (Number.isFinite(queryAfter)) return queryAfter;
  }
  const rawHeaderAfter = headerValue(request.headers, 'last-event-id');
  if (rawHeaderAfter !== undefined) {
    const headerAfter = Number(rawHeaderAfter);
    if (Number.isFinite(headerAfter)) return headerAfter;
  }
  return -1;
}

export async function readRunEventsResponse(
  request: KernelHttpRequest,
  url: URL,
  runId: string,
  rootDir: string,
): Promise<KernelHttpResponse> {
  const events = await readRunEventLog(runId, rootDir);
  const filteredEvents = eventsAfter(events, lastEventIdFromRequest(request, url));
  return {
    status: 200,
    body: {
      runId,
      events: filteredEvents.map(toDashboardEnvelope),
      sequenceThrough: events.length ? Math.max(...events.map(eventSequence)) : -1,
    },
  };
}

export function sseLine(value: string): string {
  return value.replace(/\r?\n/g, '\ndata: ');
}

export async function readRunStreamResponse(
  request: KernelHttpRequest,
  url: URL,
  runId: string,
  rootDir: string,
): Promise<KernelHttpResponse> {
  const events = await readRunEventLog(runId, rootDir);
  const filteredEvents = eventsAfter(events, lastEventIdFromRequest(request, url));
  const bodyText = filteredEvents
    .map((event) => {
      const envelope = toDashboardEnvelope(event);
      return `id: ${envelope.sequence}\ndata: ${sseLine(JSON.stringify(envelope))}\n\n`;
    })
    .join('');
  return {
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    bodyText: bodyText || ': no events after requested sequence\n\n',
  };
}

export async function readRunHealthResponse(runId: string, rootDir: string): Promise<KernelHttpResponse> {
  const events = await readRunEventLog(runId, rootDir);
  const projection = replayRunProjection(events);
  const generationEvents = events.filter((event) => event.type === 'generation.started');
  const lastGeneration = generationEvents
    .map((event) => event.payload.generation)
    .filter(Number.isFinite)
    .at(-1);
  const terminalEvent = events.find(
    (event) => event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.stopped',
  );
  return {
    status: 200,
    body: {
      runId,
      status: terminalEvent ? terminalEvent.type.replace('run.', '') : 'running',
      currentGeneration: lastGeneration ?? null,
      candidatesInFlight: 0,
      lastEventAt: projection.lastEventAt ?? null,
      eventCount: projection.eventCount,
      sequenceThrough: projection.sequenceThrough,
      capsConsumed: {
        candidates: projection.candidateIds.length,
      },
    },
  };
}

export async function listDashboardRuns(rootDir: string): Promise<Array<Record<string, unknown>>> {
  const runs: Array<Record<string, unknown>> = [];
  const caseEntries = await readdir(rootDir, { withFileTypes: true }).catch(() => null);
  if (!caseEntries) return [];
  for (const caseEntry of caseEntries) {
    if (!caseEntry.isDirectory()) continue;
    const caseDir = path.join(rootDir, caseEntry.name);
    const runEntries = await readdir(caseDir, { withFileTypes: true }).catch(() => null);
    if (!runEntries) continue;
    for (const runEntry of runEntries) {
      if (!runEntry.isDirectory()) continue;
      try {
        const index = JSON.parse(
          await readFile(path.join(caseDir, runEntry.name, 'run-index.json'), 'utf8'),
        ) as Record<string, unknown>;
        const child = index.child as { id?: string } | undefined;
        const trace = index.trace as { modelCallsPath?: unknown } | undefined;
        runs.push({
          runId: index.runId,
          caseId: index.caseId,
          caseTitle: index.caseTitle,
          child: child?.id ?? null,
          candidates: Array.isArray(index.candidates) ? index.candidates.length : 0,
          generations: Array.isArray(index.evolution) ? index.evolution.length : 0,
          hasModelCalls: Boolean(trace && typeof trace.modelCallsPath === 'string'),
        });
      } catch {
        // Ignore partial run directories.
      }
    }
  }
  return runs.sort((left, right) => String(right.runId).localeCompare(String(left.runId))).slice(0, 12);
}
