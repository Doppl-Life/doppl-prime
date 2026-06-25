import type { RunEvent } from './contracts.ts';

// The envelope the inner dashboard's reducer validates (the client RunEventEnvelope).
// Every field the client schema marks required must be present, or the frame fails
// safeParse and is silently dropped — so the adapter guarantees them. dalton's
// RunEvent types these as optional, but `normalizeRunEvent` fills them on read; the
// fallbacks here close the type-level gap and keep the adapter total.
export type DashboardEnvelope = {
  id: string;
  sequence: number;
  type: string;
  actor: string;
  occurredAt: string;
  runId: string;
  candidateId?: string;
  agenomeId?: string;
  generationId?: string;
  correlationId?: string;
  payload: unknown;
  schemaVersion: number;
};

// Projection of a (normalized) trace event onto the dashboard envelope. Pure and total:
// the event is the source of truth; required fields are guaranteed, correlation ids are
// included only when present (matching the client schema's optional fields).
export function toDashboardEnvelope(event: RunEvent): DashboardEnvelope {
  const sequence = event.sequence ?? event.index;
  return {
    id: event.id ?? `evt_${sequence}`,
    sequence,
    type: event.type,
    actor: event.actor ?? 'system',
    occurredAt: event.occurredAt ?? new Date(0).toISOString(),
    runId: event.runId ?? '',
    ...(event.candidateId !== undefined ? { candidateId: event.candidateId } : {}),
    ...(event.agenomeId !== undefined ? { agenomeId: event.agenomeId } : {}),
    ...(event.generationId !== undefined ? { generationId: event.generationId } : {}),
    ...(event.correlationId !== undefined ? { correlationId: event.correlationId } : {}),
    payload: event.payload,
    schemaVersion: event.schemaVersion ?? 1,
  };
}
