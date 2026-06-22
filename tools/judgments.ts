import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

export const JUDGMENT_SCHEMA_VERSION = 'kernel.assay-judgment.v1';
export const defaultJudgmentLedgerPath = path.join(root, 'records', 'assay-judgments', 'judgments.jsonl');

export type Verdict = 'dead' | 'obvious' | 'interesting' | 'investigate' | 'keeper';
export type JudgmentRowType = 'control' | 'kernel';
export type JudgmentTargetKind = 'case' | 'candidate' | 'control' | 'pepsi';
export type JudgmentPolarity = -1 | 0 | 1;

export type JudgmentInput = {
  runId: string;
  assaySeed: string;
  reviewer?: string;
  caseSlug: string;
  rowType: JudgmentRowType;
  targetKind: JudgmentTargetKind;
  targetId: string;
  targetTitle?: string;
  verdict: Verdict;
  note?: string;
};

export type JudgmentEvent = JudgmentInput & {
  schemaVersion: string;
  eventId: string;
  createdAt: string;
};

const verdicts = new Set<Verdict>(['dead', 'obvious', 'interesting', 'investigate', 'keeper']);
const rowTypes = new Set<JudgmentRowType>(['control', 'kernel']);
const targetKinds = new Set<JudgmentTargetKind>(['case', 'candidate', 'control', 'pepsi']);

function assertText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Bad judgment ${field}`);
  }
  return value.trim();
}

export function normalizeJudgment(input: unknown, fallbackReviewer: string): JudgmentEvent {
  const value = input as Partial<JudgmentInput>;
  const verdict = assertText(value.verdict, 'verdict') as Verdict;
  const rowType = assertText(value.rowType, 'rowType') as JudgmentRowType;
  const targetKind = assertText(value.targetKind, 'targetKind') as JudgmentTargetKind;

  if (!verdicts.has(verdict)) throw new Error(`Bad judgment verdict: ${verdict}`);
  if (!rowTypes.has(rowType)) throw new Error(`Bad judgment rowType: ${rowType}`);
  if (!targetKinds.has(targetKind)) throw new Error(`Bad judgment targetKind: ${targetKind}`);

  return {
    schemaVersion: JUDGMENT_SCHEMA_VERSION,
    eventId: randomUUID(),
    createdAt: new Date().toISOString(),
    runId: assertText(value.runId, 'runId'),
    assaySeed: assertText(value.assaySeed, 'assaySeed'),
    reviewer: (value.reviewer && value.reviewer.trim()) || fallbackReviewer,
    caseSlug: assertText(value.caseSlug, 'caseSlug'),
    rowType,
    targetKind,
    targetId: assertText(value.targetId, 'targetId'),
    targetTitle: value.targetTitle?.trim() || undefined,
    verdict,
    note: value.note?.trim() || undefined,
  };
}

export async function appendJudgment(
  input: unknown,
  options: { ledgerPath?: string; reviewer?: string } = {},
): Promise<JudgmentEvent> {
  const ledgerPath = options.ledgerPath || defaultJudgmentLedgerPath;
  const event = normalizeJudgment(input, options.reviewer || process.env.USER || 'local');
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export async function readJudgments(ledgerPath = defaultJudgmentLedgerPath): Promise<JudgmentEvent[]> {
  let raw = '';
  try {
    raw = await readFile(ledgerPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as JudgmentEvent;
      } catch {
        throw new Error(`Bad judgment JSON on line ${index + 1}`);
      }
    })
    .filter((event) => event.schemaVersion === JUDGMENT_SCHEMA_VERSION);
}

export function latestJudgments(events: JudgmentEvent[]): JudgmentEvent[] {
  const byTarget = new Map<string, JudgmentEvent>();
  for (const event of events) {
    const key = [
      event.runId,
      event.reviewer,
      event.caseSlug,
      event.rowType,
      event.targetKind,
      event.targetId,
    ].join('|');
    byTarget.set(key, event);
  }
  return Array.from(byTarget.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function isUseful(verdict: Verdict): boolean {
  return verdict === 'interesting' || verdict === 'investigate' || verdict === 'keeper';
}

export function isStrong(verdict: Verdict): boolean {
  return verdict === 'investigate' || verdict === 'keeper';
}

export function verdictPolarity(verdict: Verdict): JudgmentPolarity {
  return verdict === 'dead' || verdict === 'obvious' ? -1 : 1;
}

export function relativeLedgerPath(ledgerPath = defaultJudgmentLedgerPath): string {
  return path.relative(root, ledgerPath);
}
