import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { RunCaps } from '@doppl/contracts';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import { bootApp } from '../../../src/main';

/**
 * PD.8a — §16 config-boot smoke (ARCHITECTURE.md §15/§13/§17, KEY SAFETY RULE #4). The boot config
 * (registry/scoring/caps/problem-sets) Zod-loads-and-validates; a missing required env fails fast at boot
 * with a key-naming, no-value-echo error (§15); Langfuse absence degrades cleanly (local-first, never
 * blocks boot — §13/§17). Additive §16 smoke: it reuses + does not weaken the existing cap/redaction/
 * fail-fast safety tests (the bootApp DATABASE_URL fail-fast is covered at the boot tier in
 * main-boot.test.ts; this asserts the same invariant at the loadConfig tier + Langfuse-absence).
 */

/** A valid boot env — placeholder creds present (recorded/replay never uses them) + a DB url string. */
function validEnv(
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    OPENROUTER_API_KEY: 'or-placeholder-not-used',
    OPENAI_API_KEY: 'oai-placeholder-not-used',
    DATABASE_URL: 'postgres://u:p@localhost:5432/doppl',
    ...extra,
  };
}

describe('config-boot smoke — loadConfig validation + fail-fast env (spec §15)', () => {
  // spec(§15) — the real config sources load + Zod-validate into a complete AppConfig (registry/scoring/
  // caps/problem-sets/run-config), the §16 config-of-record boot check.
  test('config_loads_and_validates', () => {
    const config = loadConfig({ env: validEnv(), fileSources: {} });
    expect(RunCaps.safeParse(config.caps).success).toBe(true);
    expect(config.scoringPolicy.version.length).toBeGreaterThan(0);
    // all 7 registry roles resolved (strict RegistryConfig — a missing role fails validation).
    expect(config.registry.population_generator.modelId.length).toBeGreaterThan(0);
    expect(config.registry.final_judge.provider.length).toBeGreaterThan(0);
    expect(config.problemSets.length).toBeGreaterThan(0);
    expect(config.runConfig.enabledSubtypes.length).toBeGreaterThan(0);
  });

  // spec(§15) — a missing required env (DATABASE_URL) fails fast at config load, naming the var and NEVER
  // echoing a present secret value (rule #4 / LESSON 26).
  test('missing_required_env_fails_fast', () => {
    const env = validEnv();
    delete env.DATABASE_URL;
    let caught: Error | undefined;
    try {
      loadConfig({ env, fileSources: {} });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/DATABASE_URL/);
    expect(caught!.message).not.toContain('or-placeholder-not-used'); // no present-secret echo
  });
});

describe('config-boot smoke — Langfuse absence degrades cleanly (spec §13/§17, real PG)', () => {
  let adminPool: pg.Pool;
  let baseUri: string;
  let dbCounter = 0;
  const createdDbs: string[] = [];

  beforeAll(() => {
    baseUri = inject('pgConnectionUri');
    adminPool = new pg.Pool({ connectionString: baseUri });
  });

  afterAll(async () => {
    for (const name of createdDbs) {
      await adminPool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
    await adminPool.end();
  });

  async function freshDatabaseUrl(): Promise<string> {
    const name = `doppl_cfg_${dbCounter++}`;
    await adminPool.query(`CREATE DATABASE "${name}"`);
    createdDbs.push(name);
    const uri = new URL(baseUri);
    uri.pathname = `/${name}`;
    return uri.toString();
  }

  // spec(§13/§17) — Langfuse is a NON-AUTHORITATIVE projection (rule #2): no LANGFUSE_* env is required at
  // boot, so its absence never blocks a local-first boot (the server still listens).
  test('langfuse_absence_degrades_cleanly', async () => {
    const url = await freshDatabaseUrl();
    // env carries NO LANGFUSE_* vars (recorded boot, no seed) — boot must complete + serve.
    const { app, close } = await bootApp({
      env: validEnv({ DATABASE_URL: url }),
      port: 0,
      host: '127.0.0.1',
    });
    expect(app.server.listening).toBe(true);
    await close();
  });
});
