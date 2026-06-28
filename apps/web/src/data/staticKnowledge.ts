import type { KnowledgeGraph, ResearchEdge, ResearchNote } from './knowledge';

type StaticStage = 'case_study' | 'problem_recovery' | 'doppl';

interface StaticArtifact {
  readonly node_id?: string;
  readonly case_id?: string;
  readonly problem_recovery_id?: string;
  readonly solution_id?: string;
  readonly title?: string;
  readonly body?: string;
  readonly source_path?: string;
  readonly source_paths?: readonly string[];
  readonly stage?: StaticStage;
  readonly parent_ids?: readonly string[];
  readonly child_ids?: readonly string[];
  readonly scores?: {
    readonly judge?: number | null;
  };
}

interface StaticCase extends StaticArtifact {
  readonly case_id: string;
  readonly title: string;
  readonly problem_recoveries?: readonly StaticArtifact[];
  readonly solutions?: readonly StaticArtifact[];
}

interface StaticCalibrationIndex {
  readonly cases?: readonly StaticCase[];
}

const AGARDEN_REPO_BASE = 'https://github.com/Doppl-Life/agarden/blob/main/';
const STATIC_RUN_ALIAS: Record<string, string> = {
  'when-the-crashes-dont-come-575845a4': 'when-the-crashes-dont-come-575845a4',
};

export async function loadStaticKnowledgeGraph(runId: string): Promise<KnowledgeGraph | null> {
  const staticIndex = (await import('./staticAgardenKnowledgeSource.json'))
    .default as StaticCalibrationIndex;
  const caseId = STATIC_RUN_ALIAS[runId] ?? runId;
  const found = staticIndex.cases?.find((item) => item.case_id === caseId || item.node_id === caseId);
  if (found === undefined) return null;
  return buildStaticAgardenKnowledge(runId, found);
}

function buildStaticAgardenKnowledge(runId: string, sourceCase: StaticCase): KnowledgeGraph {
  const notes: Record<string, ResearchNote> = {};
  const edges: Record<string, ResearchEdge> = {};
  const agenomes: NonNullable<KnowledgeGraph['state']['agenomes']> = {};
  let sequence = 1;

  const caseNote = makeNote({
    runId,
    sequence: sequence++,
    artifact: sourceCase,
    stage: 'case_study',
    generationIndex: 0,
    agenomeId: staticAgenomeId('case', sourceCase.case_id),
  }).note;
  notes[caseNote.id] = caseNote;
  addAgenome(agenomes, caseNote.agenomeId, sourceCase.scores?.judge);
  addResearchedEdge(edges, caseNote);

  const noteByArtifactId = new Map<string, string>([[sourceCase.case_id, caseNote.id]]);
  const problemRecoveries = [...(sourceCase.problem_recoveries ?? [])].sort(byTitle);
  for (const artifact of problemRecoveries) {
    const built = makeNote({
      runId,
      sequence: sequence++,
      artifact,
      stage: 'problem_recovery',
      generationIndex: 1,
      agenomeId: staticAgenomeId('problem', sourceCase.case_id),
    });
    const { note } = built;
    notes[note.id] = note;
    noteByArtifactId.set(idOf(artifact), note.id);
    addAgenome(agenomes, note.agenomeId, artifact.scores?.judge);
    addResearchedEdge(edges, note);
    addRetrievedEdges(edges, note.agenomeId, built.parentIds, noteByArtifactId);
  }

  const solutions = [...(sourceCase.solutions ?? [])].sort(byTitle);
  for (const artifact of solutions) {
    const parentId = artifact.parent_ids?.[0] ?? sourceCase.case_id;
    const built = makeNote({
      runId,
      sequence: sequence++,
      artifact,
      stage: 'doppl',
      generationIndex: 2,
      agenomeId: staticAgenomeId('doppl', parentId),
    });
    const { note } = built;
    notes[note.id] = note;
    noteByArtifactId.set(idOf(artifact), note.id);
    addAgenome(agenomes, note.agenomeId, artifact.scores?.judge);
    addResearchedEdge(edges, note);
    addRetrievedEdges(edges, note.agenomeId, built.parentIds, noteByArtifactId);
  }

  return {
    runId,
    sequenceThrough: sequence - 1,
    state: { notes, edges, agenomes },
  };
}

function makeNote(args: {
  readonly runId: string;
  readonly sequence: number;
  readonly artifact: StaticArtifact;
  readonly stage: StaticStage;
  readonly generationIndex: number;
  readonly agenomeId: string;
}): { readonly note: ResearchNote; readonly parentIds: readonly string[] } {
  const { runId, sequence, artifact, stage, generationIndex, agenomeId } = args;
  const noteId = `research-note:${runId}:static-${sequence}`;
  const sourcePath = sourcePathOf(artifact);
  const parentIds = artifact.parent_ids ?? [];
  return {
    note: {
      id: noteId,
      runId,
      generationId: `${runId}-gen${generationIndex}`,
      agenomeId,
      toolName: 'fetch_url',
      query: `${stageLabel(stage)}: ${artifact.title ?? idOf(artifact)}`,
      snippet: snippetFor(stage, artifact),
      sourceUrls: sourcePath !== null ? [`${AGARDEN_REPO_BASE}${sourcePath}`] : [],
      sequence,
      eventId: `static-agarden:${idOf(artifact)}`,
    },
    parentIds,
  };
}

function addAgenome(
  agenomes: NonNullable<KnowledgeGraph['state']['agenomes']>,
  agenomeId: string | null,
  score: number | null | undefined,
): void {
  if (agenomeId === null || agenomes[agenomeId] !== undefined) return;
  agenomes[agenomeId] = {
    id: agenomeId,
    culled: false,
    ...(typeof score === 'number' ? { score } : {}),
  };
}

function addResearchedEdge(edges: Record<string, ResearchEdge>, note: ResearchNote): void {
  if (note.agenomeId === null) return;
  const id = `researched:${note.agenomeId}->${note.id}`;
  edges[id] = { id, source: note.agenomeId, target: note.id, type: 'researched' };
}

function addRetrievedEdges(
  edges: Record<string, ResearchEdge>,
  source: string | null,
  parentIds: readonly string[],
  noteByArtifactId: ReadonlyMap<string, string>,
): void {
  if (source === null) return;
  for (const parentId of parentIds) {
    const target = noteByArtifactId.get(parentId);
    if (target === undefined) continue;
    const id = `retrieved:${source}->${target}`;
    edges[id] = { id, source, target, type: 'retrieved' };
  }
}

function snippetFor(stage: StaticStage, artifact: StaticArtifact): string {
  const body = artifact.body ?? '';
  const preferred =
    stage === 'case_study'
      ? (sectionText(body, 'Synopsis') ?? sectionText(body, 'Context'))
      : stage === 'problem_recovery'
        ? (sectionText(body, 'Actual problem') ??
          sectionText(body, 'Surface complaint') ??
          sectionText(body, 'Hidden variable'))
        : (sectionText(body, 'Claim') ?? sectionText(body, 'Implications'));
  return compactMarkdown(preferred ?? firstParagraph(body) ?? artifact.title ?? idOf(artifact));
}

function sectionText(body: string, heading: string): string | null {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const match = /^(#{2,4})\s+(.+?)\s*$/.exec(line);
    return match?.[2]?.trim().toLowerCase() === heading.toLowerCase();
  });
  if (start === -1) return null;

  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{2,4}\s+/.test(line)) break;
    collected.push(line);
  }
  const text = compactMarkdown(collected.join('\n'));
  return text.length > 0 ? text : null;
}

function firstParagraph(body: string): string | null {
  return (
    body
      .split(/\n{2,}/)
      .map((part) => compactMarkdown(part))
      .find((part) => part.length > 0 && !part.startsWith('#') && !part.startsWith('prev_id:')) ?? null
  );
}

function compactMarkdown(value: string): string {
  return decodeHtml(value)
    .replace(/^#+\s*/gm, '')
    .replace(/\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

function idOf(artifact: StaticArtifact): string {
  return (
    artifact.node_id ??
    artifact.problem_recovery_id ??
    artifact.solution_id ??
    artifact.case_id ??
    artifact.title ??
    'unknown-artifact'
  );
}

function sourcePathOf(artifact: StaticArtifact): string | null {
  const direct = artifact.source_path;
  if (direct !== undefined) return direct;
  const first = artifact.source_paths?.[0];
  return first ?? null;
}

function staticAgenomeId(kind: 'case' | 'problem' | 'doppl', id: string): string {
  return `agarden-${kind}:${id}`;
}

function stageLabel(stage: StaticStage): string {
  if (stage === 'case_study') return 'case study';
  if (stage === 'problem_recovery') return 'problem recovery';
  return 'doppl';
}

function byTitle(a: StaticArtifact, b: StaticArtifact): number {
  return (a.title ?? idOf(a)).localeCompare(b.title ?? idOf(b));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
