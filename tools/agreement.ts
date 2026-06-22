export type SignalPolarity = -1 | 0 | 1;

export type SignalLabel = {
  targetId: string;
  labeler: string;
  polarity: SignalPolarity;
  idea?: string;
  weight?: number;
};

export type AgreementDivergence = {
  targetId: string;
  idea: string;
  aPolarity: SignalPolarity;
  bPolarity: SignalPolarity;
};

export type AgreementPair = {
  a: string;
  b: string;
  n: number;
  agree: number;
  rate: number;
  divergences: AgreementDivergence[];
};

export type AgreementReport = {
  labelers: Record<string, number>;
  pairs: AgreementPair[];
  nTargets: number;
  nLabels: number;
};

export type OverturnInput = {
  targetId: string;
  idea?: string;
  context?: string;
  machinePolarity: SignalPolarity;
  humanPolarity: SignalPolarity;
};

export type OverturnItem = Required<Pick<OverturnInput, 'targetId'>> & {
  idea: string;
  context: string;
  machinePolarity: SignalPolarity;
  humanPolarity: SignalPolarity;
};

export type OverturnReport = {
  compared: number;
  overturns: number;
  divergenceRate: number;
  lifts: number;
  drops: number;
  liftItems: OverturnItem[];
  dropItems: OverturnItem[];
};

function sign(value: number): SignalPolarity {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function aggregatePolarity(labels: Pick<SignalLabel, 'polarity' | 'weight'>[]): SignalPolarity {
  return sign(labels.reduce((sum, label) => sum + (label.polarity * (label.weight ?? 1)), 0));
}

export function buildAgreementReport(labels: SignalLabel[]): AgreementReport {
  const byTarget = new Map<string, { idea: string; byLabeler: Map<string, SignalLabel[]> }>();

  for (const label of labels) {
    const target = byTarget.get(label.targetId) || { idea: label.idea || '', byLabeler: new Map<string, SignalLabel[]>() };
    if (!target.idea && label.idea) target.idea = label.idea;
    const labelerRows = target.byLabeler.get(label.labeler) || [];
    labelerRows.push(label);
    target.byLabeler.set(label.labeler, labelerRows);
    byTarget.set(label.targetId, target);
  }

  const coverage = new Map<string, number>();
  const readsByTarget = new Map<string, { idea: string; reads: Map<string, SignalPolarity> }>();

  for (const [targetId, target] of byTarget) {
    const reads = new Map<string, SignalPolarity>();
    for (const [labeler, labelerRows] of target.byLabeler) {
      reads.set(labeler, aggregatePolarity(labelerRows));
      coverage.set(labeler, (coverage.get(labeler) || 0) + 1);
    }
    readsByTarget.set(targetId, { idea: target.idea, reads });
  }

  const labelers = Array.from(coverage.keys()).sort();
  const pairs: AgreementPair[] = [];
  for (let i = 0; i < labelers.length; i += 1) {
    for (let j = i + 1; j < labelers.length; j += 1) {
      const a = labelers[i];
      const b = labelers[j];
      let n = 0;
      let agree = 0;
      const divergences: AgreementDivergence[] = [];
      for (const [targetId, target] of readsByTarget) {
        const aPolarity = target.reads.get(a);
        const bPolarity = target.reads.get(b);
        if (aPolarity === undefined || bPolarity === undefined) continue;
        n += 1;
        if (aPolarity === bPolarity) {
          agree += 1;
        } else {
          divergences.push({
            targetId,
            idea: target.idea,
            aPolarity,
            bPolarity,
          });
        }
      }
      if (n > 0) {
        pairs.push({ a, b, n, agree, rate: roundRate(agree / n), divergences });
      }
    }
  }

  pairs.sort((a, b) => a.rate - b.rate || b.n - a.n || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  return {
    labelers: Object.fromEntries(Array.from(coverage.entries()).sort(([a], [b]) => a.localeCompare(b))),
    pairs,
    nTargets: byTarget.size,
    nLabels: labels.length,
  };
}

export function buildOverturnReport(items: OverturnInput[]): OverturnReport {
  const liftItems: OverturnItem[] = [];
  const dropItems: OverturnItem[] = [];
  let compared = 0;
  let overturns = 0;

  for (const item of items) {
    if (item.machinePolarity === 0 || item.humanPolarity === 0) continue;
    compared += 1;
    if (item.machinePolarity === item.humanPolarity) continue;
    overturns += 1;

    const overturn = {
      targetId: item.targetId,
      idea: item.idea || '',
      context: item.context || '',
      machinePolarity: item.machinePolarity,
      humanPolarity: item.humanPolarity,
    };
    if (item.humanPolarity > 0 && item.machinePolarity < 0) {
      liftItems.push(overturn);
    } else if (item.humanPolarity < 0 && item.machinePolarity > 0) {
      dropItems.push(overturn);
    }
  }

  return {
    compared,
    overturns,
    divergenceRate: compared ? roundRate(overturns / compared) : 0,
    lifts: liftItems.length,
    drops: dropItems.length,
    liftItems,
    dropItems,
  };
}

export function shouldReenter(
  report: OverturnReport,
  options: { minComparisons: number; divergenceRate: number; lifts: number },
): { go: boolean; reason: string } {
  if (report.compared < options.minComparisons) {
    return { go: false, reason: `not enough comparable targets (${report.compared} < ${options.minComparisons})` };
  }
  if (report.lifts >= options.lifts) {
    return { go: true, reason: `${report.lifts} lift(s): humans rescued machine-rejected targets` };
  }
  if (report.divergenceRate >= options.divergenceRate) {
    return { go: true, reason: `divergence ${Math.round(report.divergenceRate * 100)}% >= ${Math.round(options.divergenceRate * 100)}%` };
  }
  return { go: false, reason: `divergence ${Math.round(report.divergenceRate * 100)}% below threshold; no lift signal` };
}

const polarityGlyph: Record<SignalPolarity, string> = {
  1: '+',
  0: '0',
  [-1]: '-',
};

export function renderAgreementText(report: AgreementReport, title = 'judgment agreement'): string {
  const lines = [
    `${title} - ${report.nTargets} targets - ${report.nLabels} labels`,
    `  labelers: ${Object.entries(report.labelers).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
  ];
  if (!report.pairs.length) {
    lines.push('  no comparable pairs yet');
    return lines.join('\n');
  }
  for (const pair of report.pairs) {
    lines.push(`  ${pair.a} vs ${pair.b}: agree ${pair.agree}/${pair.n} (${Math.round(pair.rate * 100)}%)`);
    for (const item of pair.divergences.slice(0, 4)) {
      const idea = item.idea.length > 96 ? `${item.idea.slice(0, 96)}...` : item.idea;
      lines.push(`    [${polarityGlyph[item.aPolarity]}|${polarityGlyph[item.bPolarity]}] ${idea || item.targetId}`);
    }
  }
  return lines.join('\n');
}
