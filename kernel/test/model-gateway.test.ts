import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createReplayModelClient,
  parseJsonObjectResponse,
  readModelCallRecords,
  writeModelCallRecords,
  type ModelCallRecord,
  type ModelClient,
} from '../src/model-gateway.ts';

test('replay model client returns recorded responses without fresh calls', async () => {
  const replay = createReplayModelClient([
    {
      id: 'call_1',
      runId: 'run_model',
      purpose: 'problem_recovery',
      provider: 'replay',
      model: 'fixture-model',
      prompt: 'recover the problem',
      outputText: '{"title":"Recovered"}',
      metadata: { source: 'fixture' },
    },
  ]);

  const response = await replay.complete({
    runId: 'run_model',
    purpose: 'problem_recovery',
    prompt: 'recover the problem',
    model: 'fixture-model',
  });

  assert.equal(response.outputText, '{"title":"Recovered"}');
  assert.equal(replay.freshCalls(), 0);
});

test('model call records round-trip as newline-delimited JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'doppl-model-calls-'));
  const filePath = path.join(dir, 'model-calls.jsonl');
  const records: ModelCallRecord[] = [
    {
      id: 'call_1',
      runId: 'run_model',
      purpose: 'candidate_generation',
      provider: 'replay',
      model: 'fixture-model',
      prompt: 'generate candidates',
      outputText: '{"candidates":[]}',
      metadata: { latencyMs: 0 },
    },
  ];

  await writeModelCallRecords(filePath, records);

  assert.deepEqual(await readModelCallRecords(filePath), records);
  assert.equal((await readFile(filePath, 'utf8')).trim().split('\n').length, 1);
});

test('parses JSON object responses from fenced or raw model output', () => {
  assert.deepEqual(parseJsonObjectResponse('```json\n{"ok":true}\n```'), { ok: true });
  assert.deepEqual(parseJsonObjectResponse('{"ok":true}'), { ok: true });
  assert.throws(() => parseJsonObjectResponse('[1,2,3]'), /JSON object/);
});

test('model client interface can be implemented without provider SDKs', async () => {
  const client: ModelClient = {
    async complete(request) {
      return {
        id: 'call_live_stub',
        runId: request.runId,
        purpose: request.purpose,
        provider: 'stub',
        model: request.model,
        prompt: request.prompt,
        outputText: '{"ok":true}',
        metadata: { traceId: 'trace_stub' },
      };
    },
  };

  const response = await client.complete({
    runId: 'run_model',
    purpose: 'critic_judgment',
    prompt: 'judge',
    model: 'stub-model',
  });

  assert.equal(response.provider, 'stub');
  assert.equal(response.metadata.traceId, 'trace_stub');
});
