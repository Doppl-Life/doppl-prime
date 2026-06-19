/**
 * Builds a `spec(§X)` test-name prefix anchoring a test to a section of
 * ARCHITECTURE.md. Lets CI/vitest filter by anchor:
 *
 *   pnpm test --testNamePattern "spec\\(§4\\)"
 */
export function spec(anchor: string): string {
  return `spec(${anchor})`;
}
