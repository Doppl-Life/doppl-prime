import { expect, test } from "@playwright/test";

/**
 * Phase 7 happy-path smoke (P7.15). The single must-pass UI gate.
 * Asserts: configure a run → SSE events fold into the dashboard →
 * open the final-idea panel → every proof link resolves.
 *
 * Skips when:
 *   - DOPPL_E2E is unset (CI default; the smoke is opt-in)
 *   - the API server isn't reachable (caller forgot to boot it)
 *
 * Boot order:
 *   docker compose up -d postgres
 *   pnpm --filter @doppl/api dev
 *   pnpm --filter @doppl/web dev
 *   DOPPL_E2E=1 pnpm --filter @doppl/web test:e2e
 */

test.skip(() => !process.env.DOPPL_E2E, "DOPPL_E2E=1 required to run the happy-path smoke");

test("happy path: start → live events fold → final-idea links resolve", async ({ page }) => {
  // 1. Verify API + web are reachable.
  const apiUrl = process.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const apiOk = await page.evaluate(async (url) => {
    try {
      const res = await fetch(`${url}/healthz`);
      return res.ok;
    } catch {
      return false;
    }
  }, apiUrl);
  test.skip(!apiOk, `API server at ${apiUrl} is not reachable — boot it first`);

  // 2. Visit the dashboard.
  await page.goto("/");
  await expect(page.getByText("Doppl")).toBeVisible();
  await expect(page.getByText(/IDLE/)).toBeVisible();

  // 3. Fill the run-config form (defaults are valid).
  await page.getByRole("button", { name: /start run/i }).click();

  // 4. Wait for SSE events to fold. The mode indicator should flip
  //    from IDLE to LIVE.
  await expect(page.getByText("LIVE")).toBeVisible({ timeout: 15_000 });

  // 5. Wait for a candidate to land in the lineage tree.
  await expect(page.locator('[data-panel="lineage"]')).toBeVisible();

  // 6. Wait for fitness data → final-idea panel populates.
  await expect(page.locator('[data-link-id="lineage"]')).toBeVisible({ timeout: 30_000 });

  // 7. All six proof links must be marked resolved.
  for (const linkId of ["lineage", "critics", "checks", "score", "energy", "traces"]) {
    const link = page.locator(`[data-link-id="${linkId}"]`);
    await expect(link).toHaveAttribute("data-resolved", "true");
  }

  // 8. Stop the run cleanly.
  await page.getByRole("button", { name: /stop run/i }).click();
  await expect(page.getByRole("button", { name: /run stopped/i })).toBeVisible({ timeout: 10_000 });
});
