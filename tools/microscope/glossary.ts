import type { Dial, SelectedCandidate } from '../../src/contracts/index.ts';

const ideaSummaries: Record<string, string> = {
  c1: 'If self-driving cars prevent lots of crashes, businesses built around accidents shrink.',
  c2: 'If there is no human driver, traffic stops and driver-based enforcement lose their normal target.',
  c3: 'If a car can drive itself, an idle private car starts to look like an earning fleet asset.',
  c4: 'If driving time becomes sleep or work time, distance becomes less expensive and geography reprices.',
  c5: 'If self-driving arrives unevenly, the opportunity is at the boundary between places that have it and places that do not.',
  c6: 'A self-driving fleet might double as a network of mobile servers and sensors, not just transportation.',
  c7: 'A company with expensive sensor-heavy vehicles might own stranded inventory, not a durable lead.',
  c8: 'If traffic fines and fuel taxes weaken, governments may replace them by charging for road movement directly.',
};

export function modeName(dial: Dial): string {
  return dial === 'diverge' ? 'Explore mode' : 'Proof mode';
}

export function ideaText(candidate: { id: string; title: string }): string {
  return `${ideaSummaries[candidate.id] || candidate.title} (${candidate.id})`;
}

export function ideaSentence(candidate: { id: string; title: string }): string {
  return ideaSummaries[candidate.id] || candidate.title;
}

export function scoreLine(candidate: SelectedCandidate): string {
  return `${ideaText(candidate)} | surprise=${candidate.fitness.novelty.toFixed(2)} evidence=${candidate.fitness.grounding.toFixed(2)}`;
}

export function selectedLines(candidates: SelectedCandidate[]): string[] {
  return candidates.map((candidate) => `  - ${scoreLine(candidate)}`);
}
