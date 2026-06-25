import type { KernelRun } from './contracts.ts';
import { slugId } from './slug.ts';

export type ProposalNodeStage = 'case_study' | 'problem_recovery' | 'doppl';

export type ProposalNodeArtifact = {
  stage: ProposalNodeStage;
  id: string;
  path: string;
  markdown: string;
};

export type ProposalNodeCompileOptions = {
  kernel?: string;
  idFactory?: () => string;
};

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlArray(values: string[]): string {
  return `[${values.map(yamlString).join(', ')}]`;
}

function clampRating(value: number): number {
  return Math.max(-5, Math.min(5, Number(value.toFixed(1))));
}

function selectedParentRatings(run: KernelRun): number[] {
  if (run.selectedParents.length !== 2) return [];
  return run.selectedParents
    .map((parent) => run.fitnessRecords.find((record) => record.candidateId === parent.id))
    .filter((record): record is NonNullable<typeof record> => Boolean(record))
    .map((record) => record.selection?.proposalRating.judge ?? clampRating(record.total / 10 - 5));
}

function selectedParentRating(run: KernelRun): number {
  const ratings = selectedParentRatings(run);
  if (!ratings.length) return 0;
  return clampRating(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length);
}

function synopsis(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}.`;
}

// The case node's name is the headline, not the file's framing prefix. Strip a leading
// "Problem Statement:" so the name and its derived slug read as the idea, not the document.
export function cleanTitle(title: string): string {
  return title.replace(/^\s*problem\s*statement\s*:?\s*/i, '').trim() || title.trim();
}

// The case body already carries its own leading heading; the node renders the headline itself,
// so drop the duplicate from the embedded Context.
function stripLeadingHeading(markdown: string): string {
  return markdown.replace(/^\s*#[^\n]*\n+/, '').trim();
}

function knowledgeDiscovery(run: KernelRun): string {
  if (!run.knowledgePacket.items.length) return 'No stock-backed discoveries were injected.';
  return run.knowledgePacket.items
    .map(
      (item) =>
        `### ${item.citeHandle}\n\n${item.text}\n\nfield: ${item.sourceCase} · ${item.citation}`,
    )
    .join('\n\n');
}

function evaluationSection(input: {
  judgeRating: number;
  scoreSource: string;
  temporal: boolean;
  noveltyReason: string;
  groundingReason: string;
  falsifiabilityReason: string;
  costReason: string;
  relevanceReason: string;
}): string {
  return `### Evaluation

#### Novelty ${input.judgeRating >= 0 ? '+' : ''}${input.judgeRating}

${input.noveltyReason}

#### Grounding ${input.judgeRating >= 0 ? '+' : ''}${input.judgeRating}

${input.groundingReason}

#### Falsifiability ${input.judgeRating >= 0 ? '+' : ''}${input.judgeRating}

${input.falsifiabilityReason}

#### Cost-efficiency ${input.judgeRating >= 0 ? '+' : ''}${input.judgeRating}

${input.costReason}

#### Relevance ${input.judgeRating >= 0 ? '+' : ''}${input.judgeRating}

${input.relevanceReason}

#### Temporal ${input.temporal ? 'true' : 'false'}

Temporal is currently projected from the run context until the held-out proposal judge owns this field.

#### Score source

${input.scoreSource}`;
}

type YamlValue = string | number | boolean | null | string[] | { raw: string };

function rawYaml(value: string): { raw: string } {
  return { raw: value };
}

function frontmatter(fields: Array<[string, YamlValue]>): string {
  const lines = fields.map(([key, value]) => {
    if (Array.isArray(value)) return `${key}: ${yamlArray(value)}`;
    if (typeof value === 'object' && value !== null) return `${key}: ${value.raw}`;
    if (typeof value === 'string') return `${key}: ${yamlString(value)}`;
    return `${key}: ${value}`;
  });
  return `---\n${lines.join('\n')}\n---`;
}

function scoreInline(judgeRating: number): string {
  return `{ judge: ${judgeRating}, human: null, n: 0 }`;
}

function caseStudyNode(run: KernelRun, id: string): ProposalNodeArtifact {
  const name = cleanTitle(run.caseStudy.title);
  const caseSynopsis = synopsis(run.caseStudy.statedProblem || run.caseStudy.markdown);
  const markdown = `${frontmatter([
    ['id', id],
    ['stage', 'case_study'],
    ['name', name],
    ['case_id', run.caseStudy.id],
    ['next', 'problem_recovery'],
  ])}

# ${name}

## Context

${stripLeadingHeading(run.caseStudy.markdown)}

## Synopsis

${caseSynopsis}
`;
  return { stage: 'case_study', id, path: 'proposal-nodes/case-study.md', markdown };
}

function problemRecoveryNode(
  run: KernelRun,
  ids: { self: string; root: string },
  options: Required<Pick<ProposalNodeCompileOptions, 'kernel'>>,
): ProposalNodeArtifact {
  const judgeRating = selectedParentRating(run);
  const caseSynopsis = synopsis(run.caseStudy.statedProblem || run.caseStudy.markdown);
  const recoverySynopsis = synopsis(run.problemRecovery.recoveredProblem);
  const markdown = `${frontmatter([
    ['id', ids.self],
    ['stage', 'problem_recovery'],
    ['root', ids.root],
    ['prev', [ids.root]],
    ['kernel', options.kernel],
    ['temporal', false],
    ['next', 'doppl'],
    ['scores', rawYaml(scoreInline(judgeRating))],
    ['doppelgangers', 0],
  ])}

# ${run.problemRecovery.title}

## Trace

### Case study · synopsis

${caseSynopsis}

## Discovery

${knowledgeDiscovery(run)}

## Growth — Problem recovery

surface complaint -> deleted assumption -> hidden variable -> actual problem -> candidate response

### Recovered problem

${run.problemRecovery.recoveredProblem}

### Hidden constraint

${run.problemRecovery.hiddenConstraint}

### Falsifier

${run.problemRecovery.falsifier}

### Skin in the Game

- Talk to the people who would pay, operate, regulate, or be exposed to this recovered problem.
- Run the cheapest real-world check that could falsify the hidden constraint before investing in solution design.
- Update the node if field contact shows the stated problem is not the real bottleneck.

### Sprouts

- none promoted in this projection

${evaluationSection({
  judgeRating,
  scoreSource:
    'Projected from Dalton internal selection fitness. Replace with proposal held-out judge output in the assay/control phase.',
  temporal: false,
  noveltyReason: 'Problem recovery is scored separately so a good answer to the wrong problem cannot hide.',
  groundingReason: `The recovery cites ${run.problemRecovery.citedKnowledge.join(', ') || 'no injected knowledge handles'}.`,
  falsifiabilityReason: run.problemRecovery.falsifier,
  costReason: 'Validation cost is expressed as Skin in the Game rather than hidden in solution prose.',
  relevanceReason: 'The recovered problem defines what later doppl nodes must matter to.',
})}

## Path

next: doppl
`;
  return {
    stage: 'problem_recovery',
    id: ids.self,
    path: 'proposal-nodes/problem-recovery.md',
    markdown,
  };
}

function dopplNode(
  run: KernelRun,
  ids: { self: string; root: string; recovery: string },
  options: Required<Pick<ProposalNodeCompileOptions, 'kernel'>>,
): ProposalNodeArtifact | undefined {
  const child = run.fusion?.child;
  if (!child) return undefined;
  const judgeRating = selectedParentRating(run);
  const caseSynopsis = synopsis(run.caseStudy.statedProblem || run.caseStudy.markdown);
  const recoverySynopsis = synopsis(run.problemRecovery.recoveredProblem);
  const parentSummary = run.fusion.parentCandidateIds.join(' + ');
  const markdown = `${frontmatter([
    ['id', ids.self],
    ['stage', 'doppl'],
    ['root', ids.root],
    ['prev', [ids.recovery]],
    ['kernel', options.kernel],
    ['temporal', false],
    ['next', null],
    ['scores', rawYaml(scoreInline(judgeRating))],
    ['doppelgangers', 0],
  ])}

# ${child.title}

## Trace

### Case study · synopsis

${caseSynopsis}

### Problem recovery · synopsis

${recoverySynopsis}

## Discovery

${knowledgeDiscovery(run)}

## Growth — Doppl

### Claim

${child.summary}

### Implications

- Mechanism: ${child.mechanism}
- Claimed delta: ${child.claimedDelta}
- Parent lineage: ${parentSummary}
- Inherited traits: ${run.fusion.inheritedTraits.join('; ') || 'none recorded'}
- Mutation notes: ${run.fusion.mutationNotes.join('; ') || 'none recorded'}

### Opportunities

- Use this doppl as the action surface for the recovered problem.
- Test the claimed delta against the falsifier from the problem-recovery node.
- Promote the doppl only if follow-up evidence shows the mechanism creates a real advantage.

### Sprouts

- none promoted in this projection

${evaluationSection({
  judgeRating,
  scoreSource:
    'Projected from Dalton internal selected-parent fitness. Replace with proposal held-out judge output in the assay/control phase.',
  temporal: false,
  noveltyReason: 'The doppl fuses selected parent mechanisms rather than merely picking a single candidate.',
  groundingReason: `The doppl carries citations ${child.citedKnowledge.join(', ') || 'none'}.`,
  falsifiabilityReason: run.problemRecovery.falsifier,
  costReason: 'Cost-efficiency is provisional until the proposal rating map is implemented.',
  relevanceReason: 'The doppl is judged against the recovered problem, not only against candidate-local appeal.',
})}

## Path

null
`;
  return { stage: 'doppl', id: ids.self, path: 'proposal-nodes/doppl.md', markdown };
}

export function compileProposalNodes(
  run: KernelRun,
  options: ProposalNodeCompileOptions = {},
): ProposalNodeArtifact[] {
  const { idFactory } = options;
  const kernel = options.kernel || 'dalton';
  const rootId = idFactory ? idFactory() : slugId(cleanTitle(run.caseStudy.title));
  const recoveryId = idFactory ? idFactory() : slugId(run.problemRecovery.title);
  const dopplId = idFactory ? idFactory() : slugId(run.fusion?.child.title ?? 'doppl');
  const nodes = [
    caseStudyNode(run, rootId),
    problemRecoveryNode(run, { self: recoveryId, root: rootId }, { kernel }),
  ];
  const doppl = dopplNode(run, { self: dopplId, root: rootId, recovery: recoveryId }, { kernel });
  if (doppl) nodes.push(doppl);
  return nodes;
}
