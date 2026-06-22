/**
 * boot — the production composition root area: assembles the runtime worker from injected infra + the
 * real subsystem seams. The W3b-2b `POST /runs` trigger consumes `composeRunWorkerDeps`.
 */
export { composeRunWorkerDeps } from './composeRuntime';
export type { ComposeRuntimeInput } from './composeRuntime';
export { createStartRun } from './startRun';
export type { StartRunInfra } from './startRun';
