import { z } from 'zod';
import { RunEventType } from './event-type';
import { EnergyEvent } from '../domain/energy-event';
import { CandidateIdea } from '../domain/candidate-idea';
import { CriticReview } from '../verifier/critic-review';
import { CheckResult } from '../checks/check-result';
import { NoveltyScore } from '../scoring/novelty-score';
import { FitnessScore } from '../scoring/fitness-score';

/**
 * Per-type payload-shape map + payload-DoS ceiling (ARCHITECTURE.md §4/§8/§9). P0.10.
 *
 * A SEPARATE layer OVER the generic frozen `RunEventEnvelope.payload` (P0.1) — it never mutates the
 * envelope. For the six high-traffic event types named in §4 the payload is NARROWED to the matching
 * frozen Appendix-A model, so the SAME Zod schema validates the event-store write and the model;
 * every other type falls back to the generic JSONB payload. A bounded ceiling
 * (`enforcePayloadCeiling`) guards against payload size/depth DoS (the P0.1 security carry-forward),
 * and `validateEventPayload` composes the two as the single entry the P1 append path calls.
 */

/**
 * GENERIC_PAYLOAD_SCHEMA — the fallback for any NON-high-traffic event type. Structurally identical
 * to the frozen `RunEventEnvelope.payload` shape (`z.record(z.string(), z.unknown())`); defined
 * locally so this layer never reaches into or mutates the P0.1 envelope.
 */
export const GENERIC_PAYLOAD_SCHEMA = z.record(z.string(), z.unknown());

/**
 * HIGH_TRAFFIC_PAYLOAD_MAP — the §4 narrowing: each high-traffic `RunEventType` literal → its frozen
 * Appendix-A model. Typed `Partial<Record<RunEventType, z.ZodType>>` so a non-member / typo'd key is
 * a COMPILE error; the field-name snapshot freezes the key-set so an added/removed/remapped
 * high-traffic type is caught as a §2.5 cross-track regression.
 */
export const HIGH_TRAFFIC_PAYLOAD_MAP: Partial<Record<RunEventType, z.ZodType>> = {
  'energy.spent': EnergyEvent,
  'candidate.created': CandidateIdea,
  'critic.reviewed': CriticReview,
  'check.completed': CheckResult,
  'novelty.scored': NoveltyScore,
  'fitness.scored': FitnessScore,
};

/**
 * resolvePayloadSchema — returns the NARROWED schema for a high-traffic type, else the GENERIC
 * payload schema. Lookup is an OWN-property check (`hasOwnProperty.call`, lesson §11), NOT
 * `type in map` or `map[type]` alone — a crafted prototype-chain `type` (`__proto__` / `constructor`
 * / `toString`) must resolve to GENERIC, never borrow a value off `Object.prototype`. Fails OPEN to
 * generic for non-high-traffic types; the narrowed schema then fails CLOSED (rejects) on a mismatch.
 */
export function resolvePayloadSchema(type: RunEventType): z.ZodType {
  if (Object.prototype.hasOwnProperty.call(HIGH_TRAFFIC_PAYLOAD_MAP, type)) {
    const schema = HIGH_TRAFFIC_PAYLOAD_MAP[type];
    if (schema !== undefined) {
      return schema;
    }
  }
  return GENERIC_PAYLOAD_SCHEMA;
}

/**
 * Ceiling constants — MVP payload-DoS bounds. Tunable, but pinned by a literal snapshot test so any
 * change is a reviewable, test-breaking diff (the kernel/event-store P1 may re-pass stricter values).
 */
export const MAX_PAYLOAD_BYTES = 1_048_576; // 1 MiB
export const MAX_PAYLOAD_DEPTH = 32;

export type CeilingViolation = 'max_bytes' | 'max_depth';

export type CeilingResult = { ok: true } | { ok: false; violation: CeilingViolation };

/**
 * exceedsDepth — bounded, NON-recursive depth probe. Explicit-stack iterative DFS that returns the
 * INSTANT a node deeper than `maxDepth` is popped — it never descends past the limit and never
 * recurses, so a pathologically deep (or circular) input yields the violation in ~maxDepth steps and
 * can NEVER stack-overflow (bounded-on-attacker-input, lesson §8 analog). depth 0 = the payload root.
 */
function exceedsDepth(value: unknown, maxDepth: number): boolean {
  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 0 }];
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const { node, depth } = frame;
    if (node === null || typeof node !== 'object') {
      continue;
    }
    if (depth > maxDepth) {
      return true;
    }
    for (const child of Object.values(node as Record<string, unknown>)) {
      stack.push({ node: child, depth: depth + 1 });
    }
  }
  return false;
}

/**
 * enforcePayloadCeiling — pure, bounded size/depth guard. Returns a result object and NEVER throws
 * (the whole body is wrapped: any unmeasurable input is rejected, not propagated).
 *
 * ORDER IS LOAD-BEARING — the DEPTH check runs BEFORE the size check, and must NOT be reordered to
 * size-first: `JSON.stringify` itself recurses and would throw a RangeError (stack overflow) on a
 * deeply-nested attacker payload before any size check could run. So depth is bounded-and-rejected
 * first; only a depth-safe payload is ever stringified. Anything that can't be measured — an
 * unserializable value (e.g. a BigInt, where `JSON.stringify` throws) or a payload whose own accessor
 * throws — is treated as a `max_bytes` violation; a circular ref is caught earlier as `max_depth` by
 * the bounded walk. The guard fails CLOSED (reject) on any throw, never leaking it to the caller.
 */
export function enforcePayloadCeiling(payload: unknown): CeilingResult {
  try {
    // DEPTH FIRST — see the load-bearing-order note above. Do NOT flip to size-first.
    if (exceedsDepth(payload, MAX_PAYLOAD_DEPTH)) {
      return { ok: false, violation: 'max_depth' };
    }
    const serialized = JSON.stringify(payload);
    if (typeof serialized !== 'string' || serialized.length > MAX_PAYLOAD_BYTES) {
      return { ok: false, violation: 'max_bytes' };
    }
    return { ok: true };
  } catch {
    // unmeasurable input (BigInt / throwing accessor) — cannot bound it, so reject as oversize-class.
    return { ok: false, violation: 'max_bytes' };
  }
}

export type PayloadValidationResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: CeilingViolation | 'shape_mismatch'; error?: z.ZodError };

/**
 * validateEventPayload — the single entry the P1 append path calls. Enforces the ceiling, THEN
 * validates the resolved (narrowed-or-generic) schema. A ceiling violation OR a high-traffic shape
 * mismatch fails with a discriminating `reason` (`max_bytes` | `max_depth` | `shape_mismatch`); P1
 * emits a rejection/violation event on failure rather than throwing. On success the validated payload
 * is echoed back.
 */
export function validateEventPayload(
  type: RunEventType,
  payload: Record<string, unknown>,
): PayloadValidationResult {
  const ceiling = enforcePayloadCeiling(payload);
  if (!ceiling.ok) {
    return { ok: false, reason: ceiling.violation };
  }
  const parsed = resolvePayloadSchema(type).safeParse(payload);
  if (!parsed.success) {
    return { ok: false, reason: 'shape_mismatch', error: parsed.error };
  }
  return { ok: true, payload };
}
