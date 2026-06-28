/**
 * deriveCaseStudyId — a stable, readable case-study id derived purely from a run's seed (Islands pivot A4).
 * When POST /runs is not given an explicit caseStudyId (the operator picked no prepared problem), the route
 * derives one from the seed so EVERY run lands in a case-study bloom and re-running the SAME prompt groups
 * those runs under one case study (the growing network). Pure + deterministic (no RNG / clock / provider) so
 * replay re-derives identically (rule #7) — though the route persists it on run.configured, so replay reads
 * the persisted value and never recomputes.
 *
 * The id is `cs-<slug>-<hash>`: a short readable slug of the first words (nice in the URL / runs table) plus a
 * djb2 hash of the FULL normalized seed (so two different seeds that share a leading slug don't collide).
 * Normalization (drop a leading "Problem:" label, collapse whitespace, lowercase) makes trivially-different
 * spellings of the same prompt group together.
 */

function normalize(seed: string): string {
  return seed
    .replace(/^\s*problem\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** djb2 → base36, an unsigned-32-bit stable hash (an id, not security). */
function hash36(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function deriveCaseStudyId(seed: string): string {
  const normalized = normalize(seed);
  const slug = normalized
    .split(' ')
    .slice(0, 5)
    .join('-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const h = hash36(normalized);
  return slug.length > 0 ? `cs-${slug}-${h}` : `cs-${h}`;
}
