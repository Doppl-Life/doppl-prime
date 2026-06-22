import { createHash } from 'node:crypto';

export const KNOWLEDGE_SPACE_SCHEMA_VERSION = 'knowledge-space.v0';

export type KnowledgeTrustTier =
  | 'raw'
  | 'draft'
  | 'candidate'
  | 'validated'
  | 'canonical'
  | 'deprecated';

export type KnowledgeVisibility =
  | 'public'
  | 'internal'
  | 'withheld_evaluator'
  | 'secret_forbidden';

export type KnowledgeRole =
  | 'candidate'
  | 'critic'
  | 'evaluator'
  | 'operator';

export type KnowledgeKind =
  | 'Claim'
  | 'SourceReceipt'
  | 'ResearchFinding'
  | 'Hypothesis'
  | 'HiddenVariable'
  | 'Heuristic'
  | 'SkillCandidate'
  | 'NegativeFinding'
  | 'CaseInsight'
  | 'AgenomeTraitObservation'
  | 'EvaluationResult'
  | 'RunSummary';

export type MemoryMode = 'off' | 'auto' | 'pinned';

export type KnowledgeRecord = {
  id: string;
  kind: KnowledgeKind;
  text: string;
  tags: string[];
  trustTier: KnowledgeTrustTier;
  visibility: KnowledgeVisibility;
  sourcePath: string;
  sourceChunkId: string;
  citation: string;
  provenanceRefs: string[];
  sourceCase?: string;
  heading?: string;
  lineStart?: number;
  lineEnd?: number;
  runId?: string;
  candidateId?: string;
  criticId?: string;
  originEventSequence?: number;
  agenomeId?: string;
  observedAt?: string;
  validFrom?: string;
  validThrough?: string;
  refreshDueAt?: string;
};

export type KnowledgePacketRequest = {
  problemSummary: string;
  targetCase: string;
  maxItems: number;
  memoryMode: MemoryMode;
  role: KnowledgeRole;
  excludedCases: string[];
};

export type PacketItem = {
  citeHandle: string;
  score: number;
  reason: string;
  recordId: string;
  sourceChunkId: string;
  citation: string;
  record: KnowledgeRecord;
};

export type ExcludedKnowledgeItem = {
  case: string;
  reason: string;
};

export type KnowledgePacket = {
  schemaVersion: typeof KNOWLEDGE_SPACE_SCHEMA_VERSION;
  request: KnowledgePacketRequest;
  queryTags: string[];
  items: PacketItem[];
  excluded: ExcludedKnowledgeItem[];
};

export type KnowledgePacketSelectedEvent = {
  type: 'knowledge.packet_selected';
  runId: string;
  sequence: number;
  payload: KnowledgePacket;
};

export type ExtractedKnowledgeItem = {
  kind: KnowledgeKind;
  text: string;
  tags: string[];
  trustTier: KnowledgeTrustTier;
  runId: string;
  targetCase: string;
  candidateId?: string;
  criticId?: string;
  agenomeId?: string;
  originEventSequence: number;
  sourcePath: string;
  sourceChunkId: string;
  citation: string;
  visibility: KnowledgeVisibility;
  provenanceRefs: string[];
};

export type CollapsePacket = {
  type: 'knowledge.collapse_packet';
  schemaVersion: typeof KNOWLEDGE_SPACE_SCHEMA_VERSION;
  runId: string;
  targetCase: string;
  items: ExtractedKnowledgeItem[];
};

export const knowledgeSpaceInvariants = [
  'event log remains authoritative run truth',
  'every influential memory item needs provenance',
  'memory is scoped before retrieval',
  'cold or culled agenomes can still preserve useful research',
  'promotion is gated',
  'negative knowledge is first-class',
  'portable JSONL/Markdown exports outlive graph/vector stores',
  'permission boundaries beat prompt instructions',
  'time-sensitive knowledge advertises freshness',
  'run influence is observable through persisted events',
] as const;

export function createKnowledgeRecord(input: Omit<KnowledgeRecord, 'id' | 'sourceChunkId'> & { id?: string; sourceChunkId?: string }): KnowledgeRecord {
  const sourceChunkId = input.sourceChunkId || stableId('chunk', [input.sourcePath, input.lineStart ?? 1, input.lineEnd ?? input.lineStart ?? 1, input.text]);
  const id = input.id || stableId('ks', [input.kind, input.sourcePath, input.citation, input.text]);
  return { ...input, id, sourceChunkId };
}

export function packetItem(record: KnowledgeRecord, score: number, reason: string): PacketItem {
  return {
    citeHandle: citeHandleFor(record.id),
    score,
    reason,
    recordId: record.id,
    sourceChunkId: record.sourceChunkId,
    citation: record.citation,
    record,
  };
}

export function knowledgePacketToEvent(
  packet: KnowledgePacket,
  runId: string,
  sequence: number,
): KnowledgePacketSelectedEvent {
  return { type: 'knowledge.packet_selected', runId, sequence, payload: packet };
}

export function citeHandleFor(recordId: string): string {
  return `K${recordId.replace(/^ks[_:-]?/, '').slice(0, 6).toUpperCase()}`;
}

export function sourceVisibilityForPath(path: string): KnowledgeVisibility {
  const name = path.toLowerCase();
  if (name.includes('secret') || name.includes('/.env') || name.endsWith('.env')) return 'secret_forbidden';
  if (name.includes('withheld') || name.includes('with-solution') || name.includes('solution.md')) return 'withheld_evaluator';
  return 'public';
}

export function canInjectKnowledge(record: KnowledgeRecord, role: KnowledgeRole): boolean {
  if (record.visibility === 'secret_forbidden') return false;
  if (record.visibility === 'withheld_evaluator') return role === 'evaluator' || role === 'operator';
  if (record.trustTier === 'deprecated') return false;
  return record.provenanceRefs.length > 0 && Boolean(record.sourceChunkId && record.citation);
}

export function validateKnowledgeRecord(record: Partial<KnowledgeRecord>, role: KnowledgeRole = 'candidate'): string[] {
  const errors: string[] = [];
  if (!record.id) errors.push('record missing id');
  if (!record.kind || !knowledgeKinds.has(record.kind)) errors.push(`record has invalid kind: ${String(record.kind)}`);
  if (!record.text?.trim()) errors.push('record missing text');
  if (!record.trustTier || !trustTiers.has(record.trustTier)) errors.push(`record has invalid trustTier: ${String(record.trustTier)}`);
  if (!record.visibility || !visibilities.has(record.visibility)) errors.push(`record has invalid visibility: ${String(record.visibility)}`);
  if (!record.sourcePath) errors.push('record missing sourcePath');
  if (!record.sourceChunkId) errors.push('record missing sourceChunkId');
  if (!record.citation) errors.push('record missing citation');
  if (!Array.isArray(record.provenanceRefs) || record.provenanceRefs.length === 0) errors.push('record missing provenanceRefs');
  if (record.visibility === 'secret_forbidden') errors.push('record has forbidden secret visibility');
  if (record.visibility === 'withheld_evaluator' && role === 'candidate') errors.push('record has evaluator-only visibility');
  return errors;
}

export function validatePacketEvent(event: Partial<KnowledgePacketSelectedEvent>): string[] {
  const errors: string[] = [];
  if (event.type !== 'knowledge.packet_selected') errors.push('event type must be knowledge.packet_selected');
  if (!event.runId) errors.push('event missing runId');
  if (!Number.isInteger(event.sequence)) errors.push('event missing integer sequence');
  const packet = event.payload;
  if (!packet) return [...errors, 'event missing payload'];
  if (packet.schemaVersion !== KNOWLEDGE_SPACE_SCHEMA_VERSION) errors.push('payload has invalid schemaVersion');
  if (!packet.request?.targetCase) errors.push('payload request missing targetCase');
  if (!Number.isInteger(packet.request?.maxItems) || packet.request.maxItems < 0) errors.push('payload request missing maxItems');
  if (!Array.isArray(packet.items)) return [...errors, 'payload items must be an array'];

  const role = packet.request?.role || 'candidate';
  packet.items.forEach((item, index) => {
    const label = `item ${index + 1}`;
    if (!item.citeHandle) errors.push(`${label} missing citeHandle`);
    if (!item.recordId) errors.push(`${label} missing recordId`);
    if (!item.sourceChunkId) errors.push(`${label} missing sourceChunkId`);
    if (!item.citation) errors.push(`${label} missing citation`);
    if (!item.record) {
      errors.push(`${label} missing record`);
      return;
    }
    if (item.record.id && item.recordId && item.record.id !== item.recordId) errors.push(`${label} recordId mismatch`);
    if (item.record.sourceChunkId && item.sourceChunkId && item.record.sourceChunkId !== item.sourceChunkId) errors.push(`${label} sourceChunkId mismatch`);
    errors.push(...validateKnowledgeRecord(item.record, role).map((error) => `${label} ${error}`));
    if (!canInjectKnowledge(item.record, role)) errors.push(`${label} cannot be injected for role ${role}`);
  });
  return errors;
}

export function validateCollapsePacket(packet: Partial<CollapsePacket>): string[] {
  const errors: string[] = [];
  if (packet.type !== 'knowledge.collapse_packet') errors.push('packet type must be knowledge.collapse_packet');
  if (packet.schemaVersion !== KNOWLEDGE_SPACE_SCHEMA_VERSION) errors.push('packet has invalid schemaVersion');
  if (!packet.runId) errors.push('packet missing runId');
  if (!packet.targetCase) errors.push('packet missing targetCase');
  if (!Array.isArray(packet.items)) return [...errors, 'packet items must be an array'];

  packet.items.forEach((item, index) => {
    const label = `item ${index}`;
    if (!item.kind || !knowledgeKinds.has(item.kind)) errors.push(`${label} has invalid kind: ${String(item.kind)}`);
    if (!item.text?.trim()) errors.push(`${label} missing text`);
    if (!item.trustTier || !trustTiers.has(item.trustTier)) errors.push(`${label} has invalid trustTier: ${String(item.trustTier)}`);
    if (item.trustTier === 'canonical') errors.push(`${label} cannot collapse directly to canonical`);
    if (!item.runId) errors.push(`${label} missing runId`);
    if (!item.targetCase) errors.push(`${label} missing targetCase`);
    if (!Number.isInteger(item.originEventSequence)) errors.push(`${label} missing originEventSequence`);
    if (!item.sourcePath) errors.push(`${label} missing sourcePath`);
    if (!item.sourceChunkId) errors.push(`${label} missing sourceChunkId`);
    if (!item.citation) errors.push(`${label} missing citation`);
    if (!Array.isArray(item.provenanceRefs) || item.provenanceRefs.length === 0) errors.push(`${label} missing provenanceRefs`);
    if (item.visibility === 'secret_forbidden') errors.push(`${label} has forbidden secret visibility`);
  });
  return errors;
}

export function stableId(prefix: string, parts: readonly unknown[]): string {
  const digest = createHash('sha1')
    .update(parts.map((part) => String(part)).join('\n'))
    .digest('hex')
    .slice(0, 16);
  return `${prefix}_${digest}`;
}

const knowledgeKinds = new Set<KnowledgeKind>([
  'Claim',
  'SourceReceipt',
  'ResearchFinding',
  'Hypothesis',
  'HiddenVariable',
  'Heuristic',
  'SkillCandidate',
  'NegativeFinding',
  'CaseInsight',
  'AgenomeTraitObservation',
  'EvaluationResult',
  'RunSummary',
]);

const trustTiers = new Set<KnowledgeTrustTier>([
  'raw',
  'draft',
  'candidate',
  'validated',
  'canonical',
  'deprecated',
]);

const visibilities = new Set<KnowledgeVisibility>([
  'public',
  'internal',
  'withheld_evaluator',
  'secret_forbidden',
]);
