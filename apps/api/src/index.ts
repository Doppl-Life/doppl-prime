/**
 * @doppl/api — Doppl kernel + subsystems backend (Node/TS · Fastify). This barrel marks the package
 * boundary; runtime barrels (event-store writer, model gateway, …) land in their own P1/P2 slices.
 */
export const DOPPL_API_PACKAGE = '@doppl/api';

// The Fastify HTTP entry point (P6.6) — the write path is registered here; read/SSE routes follow.
// The listen()/boot wiring (real config + kernel execution) lands at P3/PD integration.
export * from './server';
