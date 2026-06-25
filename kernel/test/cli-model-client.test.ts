import test from 'node:test';
import assert from 'node:assert/strict';
import { createCliModelClient } from '../src/cli-model-client.ts';

test('cli model client runs the command headless with the prompt as the final arg', async () => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const client = createCliModelClient({
    cmd: 'claude',
    headless: ['-p'],
    run: async (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: '  {"candidates":[]}\n' };
    },
  });

  const record = await client.complete({
    runId: 'run_cli',
    purpose: 'candidate_generation',
    prompt: 'generate candidates',
    model: 'claude',
  });

  assert.deepEqual(calls[0], { cmd: 'claude', args: ['-p', 'generate candidates'] });
  assert.equal(record.provider, 'claude');
  assert.equal(record.model, 'claude');
  assert.equal(record.outputText, '{"candidates":[]}', 'stdout is trimmed');
  assert.equal(record.metadata.cli, 'claude');
});

test('cli model client labels the provider and defaults the model to the cmd', async () => {
  const client = createCliModelClient({
    cmd: 'grok',
    headless: ['-p'],
    provider: 'grok-cli',
    run: async () => ({ stdout: '{}' }),
  });

  const record = await client.complete({ runId: 'r', purpose: 'critic_judgment', prompt: 'judge' });

  assert.equal(record.provider, 'grok-cli');
  assert.equal(record.model, 'grok', 'model falls back to the cmd when unspecified');
});

test('cli model client surfaces runner failures', async () => {
  const client = createCliModelClient({
    cmd: 'claude',
    headless: ['-p'],
    run: async () => {
      throw new Error('claude exited 1');
    },
  });

  await assert.rejects(
    client.complete({ runId: 'r', purpose: 'problem_recovery', prompt: 'recover' }),
    /claude exited 1/,
  );
});

test('cli model client requires a cmd', () => {
  assert.throws(() => createCliModelClient({ cmd: '', headless: [] }), /requires a cmd/);
});
