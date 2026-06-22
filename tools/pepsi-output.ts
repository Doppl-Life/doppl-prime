// Defines the canonical Pepsi output contract, validator, and optional generator boundary.
import { spawn } from 'node:child_process';
import type { RunTrace, SelectedCandidate } from '../src/contracts/index.ts';

export const PEPSI_OUTPUT_SCHEMA_VERSION = 'kernel.pepsi-output.v1';
export const PEPSI_GENERATOR_REQUEST_SCHEMA_VERSION = 'kernel.pepsi-generator-request.v1';
export const PEPSI_SEGMENTATION_SCHEMA_VERSION = 'kernel.pepsi-segmentation.v1';

const GENERATOR_TIMEOUT_MS = 20_000;
const MAX_GENERATOR_OUTPUT_BYTES = 1_000_000;

export type PepsiSegmentationStatus = 'candidate' | 'pepsi' | 'rejected' | 'alias' | 'tactic-only' | 'lens';
export type PepsiSegmentationCount = 'zero' | 'one' | 'many';
export type PepsiCheckStatus = 'pass' | 'warn' | 'fail';

export type PossiblePepsi = {
  name: string;
  status: PepsiSegmentationStatus;
  logic: string;
  rationale: string;
  linkedCandidateIds: string[];
};

export type PepsiSegmentationTactic = {
  pepsi: string;
  name: string;
  howItPursues: string;
  hardConstraints: string[];
  softAxes: string[];
  linkedCandidateIds: string[];
};

export type PepsiCheck = {
  id: string;
  label: string;
  status: PepsiCheckStatus;
  detail: string;
};

export type PepsiSegmentation = {
  schemaVersion: typeof PEPSI_SEGMENTATION_SCHEMA_VERSION;
  caseSlug: string;
  surfaceComplaint: string;
  promotedProblem: string;
  expectedCount: PepsiSegmentationCount;
  implications: string[];
  possiblePepsis: PossiblePepsi[];
  tactics: PepsiSegmentationTactic[];
  checks: PepsiCheck[];
};

export type PepsiPacketSubtype =
  | 'cross_domain_transfer'
  | 'zeitgeist_synthesis'
  | 'problem_recovery'
  | 'consequence'
  | 'strategy'
  | 'warning'
  | 'protocol'
  | 'product'
  | 'test';

export type PepsiHumanJudgment = 'dead' | 'obvious' | 'interesting' | 'investigate' | 'keeper';

export type ProblemRecovery = {
  surfaceComplaint: string;
  deletedAssumption: string;
  hiddenVariable: string;
  actualProblem: string;
  candidateResponse: string;
};

export type ImplicationMap = {
  disappears: string[];
  getsCheaper: string[];
  winners: string[];
  losers: string[];
  secondOrderEffects: string[];
};

export type PepsiPacketLineage = {
  candidateIds: string[];
  parent: string;
  generation: number;
  operator: string;
  claimedDelta: string;
  nearestPrior: string;
};

export type PepsiPacket = {
  id: string;
  title: string;
  claim: string;
  subtype: PepsiPacketSubtype;
  sourceContext: string;
  problemRecovery: ProblemRecovery;
  implicationMap: ImplicationMap;
  noveltyBasis: string;
  groundingBasis: string;
  falsifier: string;
  mechanismCost: string;
  lensFit: string;
  lineage: PepsiPacketLineage;
  humanJudgment?: PepsiHumanJudgment;
};

export type PepsiTactic = {
  id: string;
  pepsiId: string;
  name: string;
  howItPursues: string;
  hardConstraints: string[];
  softAxes: string[];
  linkedCandidateIds: string[];
};

export type PepsiGeneratorState =
  | 'not-configured'
  | 'ok'
  | 'exited-nonzero'
  | 'malformed-json'
  | 'invalid-output'
  | 'timeout'
  | 'request-rejected'
  | 'spawn-error';

export type PepsiOutputStatus = {
  source: 'generator' | 'deterministic-fallback';
  generator: PepsiGeneratorState;
  ok: boolean;
  message: string;
  command?: string;
  elapsedMs?: number;
};

export type PepsiOutput = {
  schemaVersion: typeof PEPSI_OUTPUT_SCHEMA_VERSION;
  caseSlug: string;
  caseLabel: string;
  seedId: string;
  runId: string;
  generatedAt: string;
  status: PepsiOutputStatus;
  primaryPacketId: string | null;
  packets: PepsiPacket[];
  tactics: PepsiTactic[];
};

export type PepsiGeneratorRequest = {
  schemaVersion: typeof PEPSI_GENERATOR_REQUEST_SCHEMA_VERSION;
  caseSlug: string;
  caseLabel: string;
  seedCase: {
    seedId: string;
    title: string;
    subtype: string;
    status: string;
    caseStudyPath: string;
    seedMarkdownBytes: number;
  };
  trace: RunTrace;
};

export type PepsiOutputInput = {
  caseSlug: string;
  caseLabel: string;
  caseStudyPath: string;
  caseStudy: {
    title: string;
    subtype: string;
    status: string;
    paths: {
      caseStudy: string;
    };
  };
  seedMarkdownBytes: number;
  trace: RunTrace;
  generatedAt: string;
  generatorCommand?: string;
  timeoutMs?: number;
};

type ValidationContext = {
  caseSlug?: string;
  runId?: string;
  validCandidateIds?: Iterable<string>;
};

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Bad Pepsi output ${field}`);
  }
  return value.trim();
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Bad Pepsi output ${field}`);
  }
  return value.map((item) => item.trim());
}

function nonEmptyArray(value: string[], fallback: string): string[] {
  return value.length ? value : [fallback];
}

function assertEnum<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) throw new Error(`Bad Pepsi output ${field}: ${value}`);
  return value as T;
}

export function assertPepsiSegmentation(
  value: unknown,
  context: { caseSlug?: string; source?: string } = {},
): PepsiSegmentation {
  const packet = value as PepsiSegmentation;
  const label = context.caseSlug || 'unknown case';
  if (!packet || typeof packet !== 'object') throw new Error(`Bad Pepsi segmentation packet for ${label}.`);
  if (packet.schemaVersion !== PEPSI_SEGMENTATION_SCHEMA_VERSION) throw new Error(`Bad Pepsi segmentation schema for ${label}.`);
  if (context.caseSlug && packet.caseSlug !== context.caseSlug) {
    throw new Error(`Pepsi segmentation ${context.source || '<unknown>'} is for ${packet.caseSlug}, not ${context.caseSlug}.`);
  }
  if (!['zero', 'one', 'many'].includes(packet.expectedCount)) throw new Error(`Bad Pepsi expectedCount for ${label}.`);
  assertString(packet.caseSlug, 'segmentation.caseSlug');
  assertString(packet.surfaceComplaint, 'segmentation.surfaceComplaint');
  assertString(packet.promotedProblem, 'segmentation.promotedProblem');
  assertStringArray(packet.implications, 'segmentation.implications');
  if (!Array.isArray(packet.possiblePepsis) || !packet.possiblePepsis.length) throw new Error(`Pepsi segmentation needs possiblePepsis for ${label}.`);
  for (const item of packet.possiblePepsis) {
    assertString(item.name, 'segmentation.possiblePepsis.name');
    assertEnum(assertString(item.status, 'segmentation.possiblePepsis.status'), ['candidate', 'pepsi', 'rejected', 'alias', 'tactic-only', 'lens'], 'segmentation.possiblePepsis.status');
    assertString(item.logic, 'segmentation.possiblePepsis.logic');
    assertString(item.rationale, 'segmentation.possiblePepsis.rationale');
    assertStringArray(item.linkedCandidateIds, 'segmentation.possiblePepsis.linkedCandidateIds');
  }
  if (!Array.isArray(packet.tactics)) throw new Error(`Pepsi segmentation needs tactics for ${label}.`);
  for (const tactic of packet.tactics) {
    assertString(tactic.pepsi, 'segmentation.tactics.pepsi');
    assertString(tactic.name, 'segmentation.tactics.name');
    assertString(tactic.howItPursues, 'segmentation.tactics.howItPursues');
    assertStringArray(tactic.hardConstraints, 'segmentation.tactics.hardConstraints');
    assertStringArray(tactic.softAxes, 'segmentation.tactics.softAxes');
    assertStringArray(tactic.linkedCandidateIds, 'segmentation.tactics.linkedCandidateIds');
  }
  if (!Array.isArray(packet.checks)) throw new Error(`Pepsi segmentation needs checks for ${label}.`);
  for (const check of packet.checks) {
    assertString(check.id, 'segmentation.checks.id');
    assertString(check.label, 'segmentation.checks.label');
    assertEnum(assertString(check.status, 'segmentation.checks.status'), ['pass', 'warn', 'fail'], 'segmentation.checks.status');
    assertString(check.detail, 'segmentation.checks.detail');
  }
  return packet;
}

function assertProblemRecovery(value: unknown, packetId: string): ProblemRecovery {
  const chain = value as ProblemRecovery;
  if (!chain || typeof chain !== 'object') throw new Error(`Pepsi packet ${packetId} needs problemRecovery`);
  return {
    surfaceComplaint: assertString(chain.surfaceComplaint, `${packetId}.problemRecovery.surfaceComplaint`),
    deletedAssumption: assertString(chain.deletedAssumption, `${packetId}.problemRecovery.deletedAssumption`),
    hiddenVariable: assertString(chain.hiddenVariable, `${packetId}.problemRecovery.hiddenVariable`),
    actualProblem: assertString(chain.actualProblem, `${packetId}.problemRecovery.actualProblem`),
    candidateResponse: assertString(chain.candidateResponse, `${packetId}.problemRecovery.candidateResponse`),
  };
}

function assertImplicationMap(value: unknown, packetId: string): ImplicationMap {
  const map = value as ImplicationMap;
  if (!map || typeof map !== 'object') throw new Error(`Pepsi packet ${packetId} needs implicationMap`);
  return {
    disappears: assertStringArray(map.disappears, `${packetId}.implicationMap.disappears`),
    getsCheaper: assertStringArray(map.getsCheaper, `${packetId}.implicationMap.getsCheaper`),
    winners: assertStringArray(map.winners, `${packetId}.implicationMap.winners`),
    losers: assertStringArray(map.losers, `${packetId}.implicationMap.losers`),
    secondOrderEffects: assertStringArray(map.secondOrderEffects, `${packetId}.implicationMap.secondOrderEffects`),
  };
}

function assertLineage(value: unknown, packetId: string, validCandidateIds?: Set<string>): PepsiPacketLineage {
  const lineage = value as PepsiPacketLineage;
  if (!lineage || typeof lineage !== 'object') throw new Error(`Pepsi packet ${packetId} needs lineage`);
  const candidateIds = assertStringArray(lineage.candidateIds, `${packetId}.lineage.candidateIds`);
  if (validCandidateIds) {
    for (const id of candidateIds) {
      if (!validCandidateIds.has(id)) throw new Error(`Pepsi packet ${packetId} links unknown candidate: ${id}`);
    }
  }
  if (!Number.isInteger(lineage.generation) || lineage.generation < 0) throw new Error(`Bad Pepsi output ${packetId}.lineage.generation`);
  return {
    candidateIds,
    parent: assertString(lineage.parent, `${packetId}.lineage.parent`),
    generation: lineage.generation,
    operator: assertString(lineage.operator, `${packetId}.lineage.operator`),
    claimedDelta: assertString(lineage.claimedDelta, `${packetId}.lineage.claimedDelta`),
    nearestPrior: assertString(lineage.nearestPrior, `${packetId}.lineage.nearestPrior`),
  };
}

function assertPacket(value: unknown, validCandidateIds?: Set<string>): PepsiPacket {
  const packet = value as PepsiPacket;
  if (!packet || typeof packet !== 'object') throw new Error('Bad Pepsi packet');
  const id = assertString(packet.id, 'packet.id');
  const humanJudgment = packet.humanJudgment === undefined
    ? undefined
    : assertEnum(assertString(packet.humanJudgment, `${id}.humanJudgment`), ['dead', 'obvious', 'interesting', 'investigate', 'keeper'], `${id}.humanJudgment`);
  return {
    id,
    title: assertString(packet.title, `${id}.title`),
    claim: assertString(packet.claim, `${id}.claim`),
    subtype: assertEnum(assertString(packet.subtype, `${id}.subtype`), ['cross_domain_transfer', 'zeitgeist_synthesis', 'problem_recovery', 'consequence', 'strategy', 'warning', 'protocol', 'product', 'test'], `${id}.subtype`),
    sourceContext: assertString(packet.sourceContext, `${id}.sourceContext`),
    problemRecovery: assertProblemRecovery(packet.problemRecovery, id),
    implicationMap: assertImplicationMap(packet.implicationMap, id),
    noveltyBasis: assertString(packet.noveltyBasis, `${id}.noveltyBasis`),
    groundingBasis: assertString(packet.groundingBasis, `${id}.groundingBasis`),
    falsifier: assertString(packet.falsifier, `${id}.falsifier`),
    mechanismCost: assertString(packet.mechanismCost, `${id}.mechanismCost`),
    lensFit: assertString(packet.lensFit, `${id}.lensFit`),
    lineage: assertLineage(packet.lineage, id, validCandidateIds),
    humanJudgment,
  };
}

export function assertPepsiOutput(value: unknown, context: ValidationContext = {}): PepsiOutput {
  const output = value as PepsiOutput;
  if (!output || typeof output !== 'object') throw new Error('Bad Pepsi output packet.');
  if (output.schemaVersion !== PEPSI_OUTPUT_SCHEMA_VERSION) throw new Error(`Unknown Pepsi output schema: ${String(output.schemaVersion)}`);
  if (context.caseSlug && output.caseSlug !== context.caseSlug) throw new Error(`Pepsi output is for ${output.caseSlug}, not ${context.caseSlug}.`);
  if (context.runId && output.runId !== context.runId) throw new Error(`Pepsi output runId ${output.runId} does not match ${context.runId}.`);
  const validCandidateIds = context.validCandidateIds ? new Set(context.validCandidateIds) : undefined;
  const status = output.status as PepsiOutputStatus;
  if (!status || typeof status !== 'object') throw new Error('Pepsi output needs status.');
  assertEnum(assertString(status.source, 'status.source'), ['generator', 'deterministic-fallback'], 'status.source');
  assertEnum(assertString(status.generator, 'status.generator'), ['not-configured', 'ok', 'exited-nonzero', 'malformed-json', 'invalid-output', 'timeout', 'request-rejected', 'spawn-error'], 'status.generator');
  if (typeof status.ok !== 'boolean') throw new Error('Bad Pepsi output status.ok');
  assertString(status.message, 'status.message');
  if (status.command !== undefined) assertString(status.command, 'status.command');
  if (status.elapsedMs !== undefined && (!Number.isFinite(status.elapsedMs) || status.elapsedMs < 0)) throw new Error('Bad Pepsi output status.elapsedMs');
  if (!Array.isArray(output.packets)) throw new Error('Pepsi output needs packets.');
  const packets = output.packets.map((packet) => assertPacket(packet, validCandidateIds));
  const packetIds = new Set<string>();
  for (const packet of packets) {
    if (packetIds.has(packet.id)) throw new Error(`Duplicate Pepsi packet id: ${packet.id}`);
    packetIds.add(packet.id);
  }
  let primaryPacketId: string | null = null;
  if (packets.length > 0) {
    primaryPacketId = assertString(output.primaryPacketId, 'primaryPacketId');
    if (!packetIds.has(primaryPacketId)) throw new Error(`Primary Pepsi packet is missing: ${primaryPacketId}`);
  } else if (output.primaryPacketId !== null) {
    throw new Error('Pepsi output cannot name a primary packet when packets is empty.');
  }
  const packetById = new Map(packets.map((packet) => [packet.id, packet]));
  if (!Array.isArray(output.tactics)) throw new Error('Pepsi output needs tactics.');
  const tactics = output.tactics.map((tactic) => {
    if (!tactic || typeof tactic !== 'object') throw new Error('Bad Pepsi tactic');
    const linkedCandidateIds = assertStringArray(tactic.linkedCandidateIds, 'tactic.linkedCandidateIds');
    if (validCandidateIds) {
      for (const id of linkedCandidateIds) {
        if (!validCandidateIds.has(id)) throw new Error(`Pepsi tactic links unknown candidate: ${id}`);
      }
    }
    const pepsiId = assertString(tactic.pepsiId, 'tactic.pepsiId');
    const packet = packetById.get(pepsiId);
    if (!packet) throw new Error(`Pepsi tactic links unknown packet: ${pepsiId}`);
    const packetCandidateIds = new Set(packet.lineage.candidateIds);
    if (linkedCandidateIds.some((id) => !packetCandidateIds.has(id))) {
      throw new Error(`Pepsi tactic ${String(tactic.id || '<unknown>')} links candidates outside packet ${pepsiId}.`);
    }
    return {
      id: assertString(tactic.id, 'tactic.id'),
      pepsiId,
      name: assertString(tactic.name, 'tactic.name'),
      howItPursues: assertString(tactic.howItPursues, 'tactic.howItPursues'),
      hardConstraints: assertStringArray(tactic.hardConstraints, 'tactic.hardConstraints'),
      softAxes: assertStringArray(tactic.softAxes, 'tactic.softAxes'),
      linkedCandidateIds,
    };
  });
  return {
    schemaVersion: PEPSI_OUTPUT_SCHEMA_VERSION,
    caseSlug: assertString(output.caseSlug, 'caseSlug'),
    caseLabel: assertString(output.caseLabel, 'caseLabel'),
    seedId: assertString(output.seedId, 'seedId'),
    runId: assertString(output.runId, 'runId'),
    generatedAt: assertString(output.generatedAt, 'generatedAt'),
    status: {
      source: status.source,
      generator: status.generator,
      ok: status.ok,
      message: status.message,
      command: status.command,
      elapsedMs: status.elapsedMs,
    },
    primaryPacketId,
    packets,
    tactics,
  };
}

function allCandidates(trace: RunTrace): SelectedCandidate[] {
  const byId = new Map<string, SelectedCandidate>();
  for (const candidate of [
    ...trace.comparison.focus.selected,
    ...trace.comparison.focus.rejected,
    ...trace.comparison.alternate.selected,
    ...trace.comparison.alternate.rejected,
  ]) {
    byId.set(candidate.id, candidate);
  }
  return Array.from(byId.values());
}

function candidateIds(trace: RunTrace): string[] {
  return allCandidates(trace).map((candidate) => candidate.id);
}

function selectedCandidates(trace: RunTrace): SelectedCandidate[] {
  const byId = new Map<string, SelectedCandidate>();
  for (const candidate of trace.comparison.focus.selected.concat(trace.comparison.alternate.selected)) {
    byId.set(candidate.id, candidate);
  }
  return Array.from(byId.values());
}

function lensFor(trace: RunTrace, candidateId: string): { score: number; reasons: string[] } | undefined {
  for (const result of trace.lensResults) {
    const found = result.scores.find((score) => score.candidateId === candidateId);
    if (found) return { score: found.score, reasons: found.reasons };
  }
  return undefined;
}

function scoreCandidate(trace: RunTrace, candidate: SelectedCandidate): number {
  const lens = lensFor(trace, candidate.id)?.score || 0;
  return candidate.fitness.novelty + candidate.fitness.grounding + (lens * 0.2) - (candidate.fitness.components.riskPenalty * 0.1);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'packet';
}

function compact(value: string, max = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

function packetId(caseSlug: string, candidate: SelectedCandidate): string {
  return `pepsi:${caseSlug}:${slugify(candidate.id || candidate.title)}`;
}

function riskBand(value: number): string {
  if (value >= 0.67) return 'high';
  if (value >= 0.34) return 'medium';
  return 'low';
}

function firstUseful(items: string[], fallback: string, max = 3): string[] {
  return nonEmptyArray(items.map((item) => compact(item, 180)).filter(Boolean).slice(0, max), fallback);
}

function publicText(items: string[]): string[] {
  const forbidden = [
    /known[- ]solution/i,
    /evaluator[- ]only/i,
    /judge[- ]only/i,
    /withheld/i,
    /solution key/i,
  ];
  return items.filter((item) => !forbidden.some((pattern) => pattern.test(item)));
}

function buildPacket(input: PepsiOutputInput, candidate: SelectedCandidate): PepsiPacket {
  const lens = lensFor(input.trace, candidate.id);
  const id = packetId(input.caseSlug, candidate);
  const publicClaims = publicText(candidate.claims);
  const publicEvidence = publicText(candidate.evidence);
  return {
    id,
    title: candidate.title,
    claim: candidate.thesis,
    subtype: candidate.subtype,
    sourceContext: `${input.caseLabel}; seed ${input.trace.seed.id}: ${input.trace.seed.title}; case ${input.caseStudyPath}`,
    problemRecovery: {
      surfaceComplaint: compact(input.trace.seed.prompt, 260),
      deletedAssumption: compact(candidate.delta.changes[0] || candidate.delta.summary),
      hiddenVariable: compact(candidate.substrate),
      actualProblem: compact(candidate.mechanism),
      candidateResponse: compact(candidate.thesis, 260),
    },
    implicationMap: {
      disappears: firstUseful(candidate.delta.changes, `The prior framing around ${input.trace.seed.title} loses explanatory power.`, 2),
      getsCheaper: firstUseful(publicClaims, `It becomes cheaper to inspect ${candidate.substrate} through the candidate mechanism.`, 2),
      winners: [`Actors who can act on ${compact(candidate.mechanism, 140)}.`],
      losers: [`Actors still optimizing for ${compact(input.trace.seed.thesis, 140)}.`],
      secondOrderEffects: firstUseful(publicClaims.concat(publicEvidence), candidate.thesis, 4),
    },
    noveltyBasis: candidate.fitness.reasons.novelty,
    groundingBasis: candidate.fitness.reasons.grounding,
    falsifier: publicEvidence[0]
      ? `Fails if the cited signal does not hold: ${compact(publicEvidence[0], 180)}`
      : `Fails if ${compact(candidate.mechanism, 180)} cannot be observed or tested in this case.`,
    mechanismCost: `Mechanism cost is ${riskBand(candidate.fitness.components.riskPenalty)}; risk penalty ${candidate.fitness.components.riskPenalty.toFixed(2)} with decay ${candidate.fitness.decay.factor.toFixed(2)}.`,
    lensFit: lens
      ? `Lens ${lens.score.toFixed(2)}: ${lens.reasons.map((reason) => compact(reason, 140)).join('; ')}`
      : 'No post-selection lens score; judge by intrinsic novelty and grounding.',
    lineage: {
      candidateIds: [candidate.id],
      parent: `${candidate.parent.kind}:${candidate.parent.id}`,
      generation: candidate.generation,
      operator: candidate.operatorLabel,
      claimedDelta: candidate.delta.summary,
      nearestPrior: candidate.parent.id,
    },
  };
}

function buildTacticForTrace(trace: RunTrace, caseSlug: string, packet: PepsiPacket, candidate: SelectedCandidate): PepsiTactic {
  const lens = lensFor(trace, candidate.id);
  return {
    id: `tactic:${caseSlug}:${slugify(candidate.id)}:falsify`,
    pepsiId: packet.id,
    name: `Pressure-test ${candidate.title}`,
    howItPursues: 'Follow the packet mechanism into one observable edge case before preserving it as an output.',
    hardConstraints: [
      packet.falsifier,
      `Must preserve the claimed delta: ${compact(packet.lineage.claimedDelta, 180)}`,
    ],
    softAxes: [
      `Novelty ${candidate.fitness.novelty.toFixed(2)}`,
      `Grounding ${candidate.fitness.grounding.toFixed(2)}`,
      `Lens ${lens ? lens.score.toFixed(2) : 'n/a'}`,
    ],
    linkedCandidateIds: [candidate.id],
  };
}

function fallbackStatus(generator: PepsiGeneratorState, message: string, command?: string, elapsedMs?: number): PepsiOutputStatus {
  return {
    source: 'deterministic-fallback',
    generator,
    ok: true,
    message,
    command,
    elapsedMs,
  };
}

export function buildDeterministicPepsiOutput(
  input: PepsiOutputInput,
  status: PepsiOutputStatus = fallbackStatus('not-configured', 'DOPPL_PEPSI_GENERATOR is not configured; assembled Pepsi packets from selected candidates.'),
): PepsiOutput {
  const selected = selectedCandidates(input.trace)
    .slice()
    .sort((a, b) => scoreCandidate(input.trace, b) - scoreCandidate(input.trace, a));
  const packets = selected.map((candidate) => buildPacket(input, candidate));
  const tactics = packets.map((packet, index) => buildTacticForTrace(input.trace, input.caseSlug, packet, selected[index]));
  return assertPepsiOutput({
    schemaVersion: PEPSI_OUTPUT_SCHEMA_VERSION,
    caseSlug: input.caseSlug,
    caseLabel: input.caseLabel,
    seedId: input.trace.seed.id,
    runId: input.trace.runId,
    generatedAt: input.generatedAt,
    status,
    primaryPacketId: packets[0]?.id || null,
    packets,
    tactics,
  }, {
    caseSlug: input.caseSlug,
    runId: input.trace.runId,
    validCandidateIds: candidateIds(input.trace),
  });
}

export function buildPepsiGeneratorRequest(input: PepsiOutputInput): PepsiGeneratorRequest {
  const request: PepsiGeneratorRequest = {
    schemaVersion: PEPSI_GENERATOR_REQUEST_SCHEMA_VERSION,
    caseSlug: input.caseSlug,
    caseLabel: input.caseLabel,
    seedCase: {
      seedId: input.trace.seed.id,
      title: input.caseStudy.title,
      subtype: input.caseStudy.subtype,
      status: input.caseStudy.status,
      caseStudyPath: input.caseStudy.paths.caseStudy,
      seedMarkdownBytes: input.seedMarkdownBytes,
    },
    trace: input.trace,
  };
  assertPepsiGeneratorRequestClean(request);
  return request;
}

export function assertPepsiGeneratorRequestClean(request: PepsiGeneratorRequest): void {
  if (!request.seedCase.caseStudyPath.endsWith('/case-study.md')) {
    throw new Error(`Pepsi generator request seed path must point at case-study.md: ${request.seedCase.caseStudyPath}`);
  }
  const serialized = JSON.stringify(request);
  const forbidden = [
    'solution.md',
    'pepsi-segmentation',
    'promotedProblem',
    'possiblePepsis',
    'expectedCount',
    'known-solution',
    'known solution',
    'known-answer',
    'known intervention',
    'evaluator-only',
  ];
  const hit = forbidden.find((token) => serialized.includes(token));
  if (hit) throw new Error(`Pepsi generator request contains evaluator-only material: ${hit}`);
}

type GeneratorRunResult = {
  stdout: string;
  elapsedMs: number;
};

function runPepsiGenerator(command: string, request: PepsiGeneratorRequest, timeoutMs: number): Promise<GeneratorRunResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(command, [], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer: NodeJS.Timeout;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({ stdout, elapsedMs: Date.now() - started });
    };

    const killGenerator = (): void => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };

    timer = setTimeout(() => {
      timedOut = true;
      killGenerator();
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > MAX_GENERATOR_OUTPUT_BYTES) {
        killGenerator();
        finish(new Error(`generator output exceeded ${MAX_GENERATOR_OUTPUT_BYTES} bytes`));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > MAX_GENERATOR_OUTPUT_BYTES) {
        killGenerator();
        finish(new Error(`generator stderr exceeded ${MAX_GENERATOR_OUTPUT_BYTES} bytes`));
      }
    });
    child.on('error', (error) => finish(Object.assign(error, { name: 'spawn-error' })));
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') finish(Object.assign(error, { name: 'spawn-error' }));
    });
    child.on('close', (code) => {
      if (timedOut) {
        finish(Object.assign(new Error(`generator timed out after ${timeoutMs}ms`), { name: 'timeout' }));
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim() ? `: ${compact(stderr, 240)}` : '';
        finish(Object.assign(new Error(`generator exited with ${code}${detail}`), { name: 'exited-nonzero' }));
        return;
      }
      finish();
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

function statusFromError(error: unknown): PepsiGeneratorState {
  if (error instanceof SyntaxError) return 'malformed-json';
  if (error instanceof Error) {
    if (error.name === 'timeout') return 'timeout';
    if (error.name === 'exited-nonzero') return 'exited-nonzero';
    if (error.name === 'spawn-error') return 'spawn-error';
    if (error.message.includes('evaluator-only') || error.message.includes('Pepsi generator request')) return 'request-rejected';
  }
  return 'invalid-output';
}

export async function buildPepsiOutput(input: PepsiOutputInput): Promise<PepsiOutput> {
  const command = (input.generatorCommand ?? process.env.DOPPL_PEPSI_GENERATOR)?.trim();
  if (!command) return buildDeterministicPepsiOutput(input);

  try {
    const request = buildPepsiGeneratorRequest(input);
    const result = await runPepsiGenerator(command, request, input.timeoutMs || GENERATOR_TIMEOUT_MS);
    const parsed = JSON.parse(result.stdout) as PepsiOutput;
    const normalized = {
      ...parsed,
      status: {
        source: 'generator',
        generator: 'ok',
        ok: true,
        message: `Pepsi output generated by ${command}.`,
        command,
        elapsedMs: result.elapsedMs,
      },
    };
    return assertPepsiOutput(normalized, {
      caseSlug: input.caseSlug,
      runId: input.trace.runId,
      validCandidateIds: candidateIds(input.trace),
    });
  } catch (error) {
    const state = statusFromError(error);
    const message = error instanceof Error ? error.message : String(error);
    return buildDeterministicPepsiOutput(input, fallbackStatus(state, `Generator unavailable; deterministic Pepsi output used. ${message}`, command));
  }
}
