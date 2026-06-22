// Generates candidate pools from fixture source packets and records lineage.
import type {
  Candidate,
  CandidatePool,
  LineageLedger,
  LineageNode,
  ParentRef,
  ReproductionOperator,
  RunCaps,
  SeedFixture,
  SourcePacket,
  TraceEvent,
} from './contracts/index.ts';
import { defaultRunCaps, getBoundary } from './contracts/index.ts';

type GenerateOptions = {
  generation?: number;
  parentCandidateIds?: string[];
  caps?: RunCaps;
  existingCandidateCount?: number;
};

function operatorFor(packet: SourcePacket, operators: ReproductionOperator[]): ReproductionOperator {
  const operator = operators.find((item) => item.id === packet.operatorId);
  if (!operator) {
    throw new Error(`Unknown reproduction operator for ${packet.id}: ${packet.operatorId}`);
  }
  return operator;
}

function packetGeneration(packet: SourcePacket): number {
  return packet.generation || (packet.parentCandidateId ? 2 : 1);
}

function parentFor(seedId: string, packet: SourcePacket): ParentRef {
  return packet.parentCandidateId
    ? { kind: 'candidate', id: packet.parentCandidateId }
    : { kind: 'seed', id: seedId };
}

function rejectNode(seedId: string, packet: SourcePacket, operators: ReproductionOperator[]): LineageNode {
  const operator = operatorFor(packet, operators);
  const parent = parentFor(seedId, packet);
  return {
    id: `reject-${packet.id}`,
    parentId: parent.id,
    parent,
    generation: packetGeneration(packet),
    operatorId: operator.id,
    operatorLabel: operator.label,
    sourcePacketIds: [packet.id],
    title: packet.title,
    status: 'rejected',
    rejectionReason: packet.noDeltaReason || 'No candidate delta was produced.',
  };
}

function generateCandidate(seedId: string, packet: SourcePacket, operators: ReproductionOperator[]): Candidate {
  const operator = operatorFor(packet, operators);
  if (!packet.candidateId || !packet.candidate || !packet.delta) {
    throw new Error(`Cannot generate candidate from incomplete source packet: ${packet.id}`);
  }
  const parent = parentFor(seedId, packet);

  return {
    id: packet.candidateId,
    parentId: parent.id,
    parent,
    generation: packetGeneration(packet),
    operatorId: operator.id,
    operatorLabel: operator.label,
    sourcePacketIds: [packet.id],
    subtype: packet.candidate.subtype || operator.defaultSubtype,
    title: packet.candidate.title,
    thesis: packet.candidate.thesis,
    substrate: packet.substrate,
    mechanism: packet.mechanism,
    delta: packet.delta,
    claims: packet.claims || [],
    evidence: packet.evidence || [],
    metricHints: packet.metrics,
    observedAt: packet.observedAt,
  };
}

function generatedNode(candidate: Candidate): LineageNode {
  return {
    id: candidate.id,
    parentId: candidate.parentId,
    parent: candidate.parent,
    generation: candidate.generation,
    operatorId: candidate.operatorId,
    operatorLabel: candidate.operatorLabel,
    sourcePacketIds: candidate.sourcePacketIds,
    title: candidate.title,
    delta: candidate.delta,
    status: 'generated',
  };
}

function packetsForGeneration(fixture: SeedFixture, options: Required<GenerateOptions>): SourcePacket[] {
  const selectedParents = new Set(options.parentCandidateIds);
  return fixture.sourcePackets.filter((packet) => {
    const generation = packetGeneration(packet);
    if (generation !== options.generation) return false;
    if (generation === 1) return !packet.parentCandidateId;
    return packet.parentCandidateId ? selectedParents.has(packet.parentCandidateId) : false;
  });
}

function capPackets(seedId: string, packets: SourcePacket[], options: Required<GenerateOptions>): SourcePacket[] {
  const remainingSlots = Math.max(0, options.caps.maxPopulation - options.existingCandidateCount);
  const childrenByParent = new Map<string, number>();
  const capped: SourcePacket[] = [];

  for (const packet of packets) {
    if (capped.filter((item) => !item.noDeltaReason).length >= remainingSlots && !packet.noDeltaReason) continue;
    const parent = parentFor(seedId, packet);
    const parentId = parent.id;
    const count = childrenByParent.get(parentId) || 0;
    if (parent.kind === 'candidate' && count >= options.caps.maxChildrenPerParent && !packet.noDeltaReason) continue;
    capped.push(packet);
    if (!packet.noDeltaReason && parent.kind === 'candidate') {
      childrenByParent.set(parentId, count + 1);
    }
  }

  return capped;
}

function maxChildrenPerCandidateParent(candidates: Candidate[]): number {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const parent = candidate.parent;
    if (parent.kind !== 'candidate') continue;
    counts.set(parent.id, (counts.get(parent.id) || 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

export function generateCandidatePool(fixture: SeedFixture, options: GenerateOptions = {}): {
  pool: CandidatePool;
  event: TraceEvent;
} {
  const resolved: Required<GenerateOptions> = {
    generation: options.generation || 1,
    parentCandidateIds: options.parentCandidateIds || [],
    caps: options.caps || defaultRunCaps,
    existingCandidateCount: options.existingCandidateCount || 0,
  };
  const stoppedByGenerationCap = resolved.generation > resolved.caps.maxGenerations;
  const packets = stoppedByGenerationCap
    ? []
    : capPackets(fixture.seed.id, packetsForGeneration(fixture, resolved), resolved);
  const rejected = packets
    .filter((packet) => packet.noDeltaReason)
    .map((packet) => rejectNode(fixture.seed.id, packet, fixture.operators));
  const candidates = packets
    .filter((packet) => !packet.noDeltaReason)
    .map((packet) => generateCandidate(fixture.seed.id, packet, fixture.operators));
  const lineage: LineageLedger = {
    seedId: fixture.seed.id,
    generated: candidates.map(generatedNode),
    rejected,
  };
  const pool = {
    seed: fixture.seed,
    candidates,
    lineage,
  };

  return {
    pool,
    event: {
      stage: 'generate',
      input: `${fixture.seed.id}: ${fixture.seed.title}`,
      decision: `Generated ${pool.candidates.length} generation-${resolved.generation} children from ${packets.length} source packets; rejected ${rejected.length} no-delta packets.`,
      reason: 'Generation now applies named reproduction operators to source packets and records child deltas before selection.',
      output: `CandidatePool(${pool.candidates.map((candidate) => candidate.id).join(', ')})`,
      goalChecks: [
        {
          id: 'shared-pool',
          label: 'One shared candidate pool exists before dial-specific selection.',
          passed: stoppedByGenerationCap || pool.candidates.length > 0,
          detail: `${pool.candidates.length} generation-${resolved.generation} candidates are available to both dials.`,
        },
        {
          id: 'lineage-delta-visible',
          label: 'Every generated child states what changed from its parent.',
          passed: pool.candidates.every((candidate) => candidate.delta.changes.length > 0),
          detail: `${pool.candidates.length} generated children carry explicit deltas.`,
        },
        {
          id: 'no-delta-rejects-visible',
          label: 'No-delta source packets are rejected before selection.',
          passed: rejected.every((node) => node.rejectionReason) &&
            rejected.every((node) => !pool.candidates.some((candidate) => candidate.sourcePacketIds.includes(node.sourcePacketIds[0]))),
          detail: `${rejected.length} no-delta packets rejected before fitness.`,
        },
        {
          id: 'operator-source-lineage',
          label: 'Generated candidates carry operator and source packet lineage.',
          passed: pool.candidates.every((candidate) => candidate.operatorId && candidate.sourcePacketIds.length > 0 && candidate.generation === resolved.generation),
          detail: pool.candidates.map((candidate) => `${candidate.id}:${candidate.operatorId}/${candidate.sourcePacketIds.join('+')}`).join(', '),
        },
        {
          id: 'generation-caps',
          label: 'Generation obeys max population and max children per selected candidate parent caps.',
          passed: resolved.existingCandidateCount + pool.candidates.length <= resolved.caps.maxPopulation &&
            maxChildrenPerCandidateParent(pool.candidates) <= resolved.caps.maxChildrenPerParent,
          detail: `generation=${resolved.generation}; existing=${resolved.existingCandidateCount}; generated=${pool.candidates.length}; maxPopulation=${resolved.caps.maxPopulation}; maxChildrenPerCandidateParent=${maxChildrenPerCandidateParent(pool.candidates)}; maxChildrenPerParent=${resolved.caps.maxChildrenPerParent}`,
        },
      ],
      boundary: getBoundary('generate'),
    },
  };
}
