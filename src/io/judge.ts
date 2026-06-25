// The judge's rating function (its other function is admission, in admit.ts). Rates each survivor on
// the five axes via the configured judge provider; the score lands in the node's scores.judge and the
// per-axis reasoning renders into ### Evaluation. Falls back to a neutral evaluation if unavailable.
import { askJSON } from './cognition.ts';
import { loadConfig } from './config.ts';
import type { Evaluation } from './compile-node.ts';

export function neutralEvaluation(): Evaluation {
  return { novelty: 0, grounding: 0, falsifiability: 0, costEfficiency: 0, relevance: 0, judge: 0, reasons: {} };
}

export function evaluate(items: { title: string; summary: string }[], context: string): { evals: Evaluation[]; note: string } {
  if (!items.length) return { evals: [], note: 'nothing to evaluate' };
  const prompt = `As the judge, rate each candidate on five axes from -5 to +5 — Novelty, Grounding, Falsifiability, Cost-efficiency, Relevance — each with a one-line reason, then judge = round(mean of the five). Negative means value-subtracting, not merely ineffective.
Context: ${context}
Candidates:
${items.map((c, i) => `${i}. ${c.title} — ${c.summary}`).join('\n')}
Return a JSON array aligned to candidate order. Each: {"novelty":n,"grounding":n,"falsifiability":n,"costEfficiency":n,"relevance":n,"judge":n,"reasons":{"Novelty":"...","Grounding":"...","Falsifiability":"...","Cost-efficiency":"...","Relevance":"..."}}.`;
  const { value, note } = askJSON<Evaluation[]>(loadConfig().cognition.judge, prompt);
  if (!Array.isArray(value)) return { evals: items.map(() => neutralEvaluation()), note: `judge: ${note}; neutral fallback` };
  return { evals: items.map((_, i) => value[i] ?? neutralEvaluation()), note: `judge: evaluated ${value.length}` };
}
