/**
 * Shared path-guard for the replay-fixture scripts (PD.1 dump-replay + PD.2 seed-demo). A `runId` becomes
 * the artifact filename (`fixtures/replay/<runId>.json`), so reject any path separator / traversal BEFORE
 * any read or write — the dump can never escape its directory + the seed can never load outside the
 * committed fixtures (even for a future untrusted caller; a real kernel runId is an opaque, separator-free
 * id). Single-sourced here (LESSON 5 extract-at-the-2nd-consumer) so dump + seed share one guard.
 */
export function assertSafeRunId(runId: string): void {
  if (
    runId.length === 0 ||
    runId === '.' ||
    runId === '..' ||
    runId.includes('/') ||
    runId.includes('\\') ||
    runId.includes('\0')
  ) {
    throw new Error(
      `replay-fixture: unsafe runId '${runId}' — must be a plain id (no path separators / traversal)`,
    );
  }
}
