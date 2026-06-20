import type { Hono } from "hono";
import { ZodError } from "zod";
import { RunAlreadyActiveError } from "../../runtime/errors.js";
import { IllegalTransitionError } from "../../runtime/state-machines/errors.js";

/**
 * Maps typed runtime errors to HTTP status codes consistently. Wired
 * via `app.onError(...)` rather than middleware — Hono's middleware
 * unwraps errors before they reach a try/catch around `next()`, so the
 * onError hook is the canonical place to intercept route throws.
 */

export function attachErrorHandler(app: Hono): void {
  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json(
        {
          error: "validation_failed",
          issues: err.errors.map((e) => ({ path: e.path, message: e.message })),
        },
        400,
      );
    }
    if (err instanceof RunAlreadyActiveError) {
      return c.json({ error: "run_already_active", activeRunId: err.activeRunId }, 409);
    }
    if (err instanceof IllegalTransitionError) {
      return c.json({ error: "illegal_state_transition", detail: err.message }, 409);
    }
    const msg = err instanceof Error ? err.message : "internal_error";
    return c.json({ error: "internal_error", detail: msg }, 500);
  });
}
