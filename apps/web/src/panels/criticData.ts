import { CriticReview } from '../data/contracts';
import type { RunEventEnvelope } from '../data/contracts';

/**
 * criticData — the PURE critic-review selector (same §6 events-derived pattern as the charts/energy
 * panel). Collects `CriticReview` per `candidateId` from `critic.reviewed` events (validated via the
 * frozen `CriticReview`), ordered by first-seen `sequence` (the sole ordering key — replay-equivalent).
 *
 * KEY SAFETY RULE #6 (critics emit evidence only — anti-reward-hacking, carried to the DISPLAY): the
 * selector returns each review VERBATIM (exactly the 7 frozen fields) — it NEVER derives a winner /
 * selection / verdict / score-override from the critiques. The dashboard displays the gauntlet; it
 * never re-decides. A malformed payload is skipped defensively.
 */

export type CriticReviewValue = ReturnType<typeof CriticReview.parse>;

/** Group `critic.reviewed` reviews by candidateId; per-candidate + key order both follow first-seen sequence. */
export function deriveReviewsByCandidate(
  events: readonly RunEventEnvelope[],
): Map<string, CriticReviewValue[]> {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const byCandidate = new Map<string, CriticReviewValue[]>();
  for (const e of ordered) {
    if (e.type !== 'critic.reviewed') continue;
    const parsed = CriticReview.safeParse(e.payload);
    if (!parsed.success) continue; // skip a malformed payload defensively
    const list = byCandidate.get(parsed.data.candidateId) ?? [];
    list.push(parsed.data);
    byCandidate.set(parsed.data.candidateId, list);
  }
  return byCandidate;
}
