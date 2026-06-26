import type { ModelGatewayRequest } from '@doppl/contracts';

/**
 * Shape a test-fake held-out-judge output to match the request (lesson §5 — single-source so every
 * integration fake stays correct as the judge path evolves). Wave 2 Step 4 HOISTED the judge to ONE
 * peer-context call per generation: a multi-candidate request carries `[CANDIDATE ref=N]`-labeled DATA blobs
 * → return the comparative `{candidates:[{ref,...axes}]}` shape (one entry per ref); a single-candidate
 * generation still uses the flat `runJudge` request (no ref labels) → return the flat per-axis `axes`.
 */
export function judgeFakeOutput(
  request: ModelGatewayRequest,
  axes: Record<string, number>,
): unknown {
  const refs = (request.messages ?? [])
    .filter((m) => m.role === 'user')
    .map((m) => /\[CANDIDATE ref=([^\]]+)\]/.exec(m.content)?.[1])
    .filter((r): r is string => r !== undefined);
  if (refs.length === 0) {
    return axes;
  }
  return { candidates: refs.map((ref) => ({ ref, ...axes })) };
}
