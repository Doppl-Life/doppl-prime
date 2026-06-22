import type { SignalLabel, SignalPolarity } from './agreement.ts';

export const BEDROCK_SIGNAL_SCHEMA_VERSION = 'bedrock-signal.v0';

export type AgoraSignalKind = 'sprout' | 'afrit';
export type AgoraVerdictDimension = 'novel' | 'feasible' | 'derivative' | 'not-it' | 'because';

export type AgoraPost = {
  postId: string;
  spawncidenceId: string;
  sourceAgenome: string;
  kind: AgoraSignalKind;
  context: string;
  idea: string;
  internalScore: number;
  costUsd: number;
  traceLink: string;
  ts: string;
  exploration: boolean;
};

export type AgoraVerdict = {
  postId: string;
  spawncidenceId: string;
  kind: AgoraSignalKind;
  reactor: string;
  dimension: AgoraVerdictDimension;
  because: string;
  weight: number;
  ts: string;
};

export type BedrockSignalValidation = {
  ok: boolean;
  errors: string[];
};

export const agoraVerdictPolarity: Record<AgoraVerdictDimension, SignalPolarity> = {
  novel: 1,
  feasible: 1,
  derivative: -1,
  'not-it': -1,
  because: 0,
};

export const agoraReactionMap: Record<AgoraVerdictDimension, string> = {
  novel: 'cool / non-obvious / accretive',
  feasible: 'actually buildable / useful',
  derivative: 'tried before / obvious / low-lift',
  'not-it': 'wrong / uninteresting / dead end',
  because: 'richer free-text signal',
};

export function validateAgoraPost(post: AgoraPost): BedrockSignalValidation {
  const errors = [
    required('postId', post.postId),
    required('spawncidenceId', post.spawncidenceId),
    required('sourceAgenome', post.sourceAgenome),
    validateKind(post.kind),
    required('context', post.context),
    required('idea', post.idea),
    finiteNumber('internalScore', post.internalScore),
    finiteNumber('costUsd', post.costUsd),
    required('traceLink', post.traceLink),
    required('ts', post.ts),
  ].filter(Boolean);
  return { ok: errors.length === 0, errors };
}

export function validateAgoraVerdict(verdict: AgoraVerdict): BedrockSignalValidation {
  const errors = [
    required('postId', verdict.postId),
    required('spawncidenceId', verdict.spawncidenceId),
    validateKind(verdict.kind),
    required('reactor', verdict.reactor),
    validateDimension(verdict.dimension),
    finiteNumber('weight', verdict.weight),
    required('ts', verdict.ts),
  ].filter(Boolean);
  return { ok: errors.length === 0, errors };
}

export function verdictToSignalLabel(verdict: AgoraVerdict, idea = ''): SignalLabel {
  return {
    targetId: verdict.postId,
    labeler: verdict.reactor,
    polarity: agoraVerdictPolarity[verdict.dimension],
    idea,
    weight: verdict.weight,
  };
}

export function postVerdictsToSignalLabels(
  posts: readonly AgoraPost[],
  verdicts: readonly AgoraVerdict[],
): SignalLabel[] {
  const ideasByPost = new Map(posts.map((post) => [post.postId, post.idea]));
  return verdicts.map((verdict) => verdictToSignalLabel(verdict, ideasByPost.get(verdict.postId) ?? ''));
}

function required(field: string, value: string): string {
  return value.trim() ? '' : `${field} is required`;
}

function finiteNumber(field: string, value: number): string {
  return Number.isFinite(value) ? '' : `${field} must be finite`;
}

function validateKind(kind: AgoraSignalKind): string {
  return kind === 'sprout' || kind === 'afrit' ? '' : `kind must be sprout or afrit`;
}

function validateDimension(dimension: AgoraVerdictDimension): string {
  return Object.hasOwn(agoraVerdictPolarity, dimension) ? '' : `unknown verdict dimension: ${dimension}`;
}
