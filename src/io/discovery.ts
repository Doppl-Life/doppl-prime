// Discovery as a kernel process (mechanics/kernel/discovery.md): fetch high-signal context via the
// routed tool (web→firecrawl, youtube→gemini, x→grok, …, with fallback), then the admission judge
// decides what clears the bar and writes keepers to stock. The router fetches; the judge decides.
import { admit, type AdmittedFinding } from './admit.ts';
import { route } from './cognition.ts';
import type { Sink } from './sink.ts';

export type DiscoveryResult = {
  admitted: AdmittedFinding[];
  fetchedVia: string; // which tool won the route (or 'none')
  tried: string[]; // the audit log — which tools were attempted and why each was skipped
  admitNote: string;
};

export function discover(focus: string, scenario: string, sink: Sink): DiscoveryResult {
  const fetched = route(scenario, `Research this topic and report concrete, sourced findings with their second-order consequences:\n${focus}`);
  const { admitted, note } = admit(focus, fetched.out, sink);
  return { admitted, fetchedVia: fetched.tool, tried: fetched.tried, admitNote: note };
}
