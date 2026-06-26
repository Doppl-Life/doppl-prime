import type { Dispatch } from "react";
import { RunEventEnvelope } from "../data/contracts.js";
import type { RunClient } from "../data/runClient.js";
import type { RunStoreAction } from "./reducer.js";

/**
 * Polling/replay resync orchestrator (P7.2). The SSE stream's
 * built-in polling fallback covers the common live → degraded path;
 * this helper covers the manual cases:
 *  - "Reload from server" button → fetch all events after current
 *    sequenceThrough and apply them.
 *  - Replay-mode entry → reset store + load events from sequence 0.
 *
 * Both produce the identical fold state to live streaming because the
 * reducer is the same.
 */

export interface ResyncFromServerInput {
  client: RunClient;
  runId: string;
  afterSequence: number;
  dispatch: Dispatch<RunStoreAction>;
}

export async function resyncFromServer(input: ResyncFromServerInput): Promise<number> {
  let lastApplied = input.afterSequence;
  let cursor = input.afterSequence;
  while (true) {
    const out = await input.client.getEvents(input.runId, {
      afterSequence: cursor,
      limit: 200,
    });
    if (out.events.length === 0) break;
    for (const raw of out.events) {
      const parsed = RunEventEnvelope.safeParse(raw);
      if (!parsed.success) continue;
      if (parsed.data.sequence <= lastApplied) continue;
      input.dispatch({ kind: "APPLY_EVENT", event: parsed.data });
      lastApplied = parsed.data.sequence;
      cursor = parsed.data.sequence;
    }
    if (out.events.length < 200) break;
  }
  return lastApplied;
}
