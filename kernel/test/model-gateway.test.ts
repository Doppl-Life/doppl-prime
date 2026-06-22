import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createOpenRouterModelClient,
  createReplayModelClient,
  createRecordingModelClient,
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

test('recording model client captures returned call records', async () => {
  const wrapped = createRecordingModelClient({
    async complete(request) {
      return {
        id: 'call_recorded',
        runId: request.runId,
        purpose: request.purpose,
        provider: 'stub',
        model: request.model,
        prompt: request.prompt,
        outputText: '{"ok":true}',
        metadata: {},
      };
    },
  });

  await wrapped.complete({
    runId: 'run_model',
    purpose: 'problem_recovery',
    prompt: 'recover',
    model: 'stub-model',
  });

  assert.equal(wrapped.records.length, 1);
  assert.equal(wrapped.records[0]?.prompt, 'recover');
});

test('openrouter model client sends server-side authenticated chat completions', async () => {
  const requests: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> =
    [];
  const client = createOpenRouterModelClient({
    apiKey: 'test-api-key',
    fetch: async (url, init) => {
      requests.push({
        url,
        init: {
          headers: init.headers as Record<string, string>,
          body: init.body as string,
        },
      });
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'req_123' },
        async json() {
          return { choices: [{ message: { content: '{"ok":true}' } }] };
        },
      };
    },
  });

  const record = await client.complete({
    runId: 'run_live',
    purpose: 'problem_recovery',
    prompt: 'recover',
    model: 'openrouter/test-model',
    responseFormat: 'json_object',
  });

  assert.equal(requests[0]?.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(requests[0]?.init.headers.Authorization, 'Bearer test-api-key');
  assert.equal(JSON.parse(requests[0]!.init.body).response_format.type, 'json_object');
  assert.equal(record.provider, 'openrouter');
  assert.equal(record.outputText, '{"ok":true}');
  assert.equal(record.metadata.requestId, 'req_123');
});

test('openrouter model client sends JSON schema structured output requests', async () => {
  const requests: Array<{ body: string }> = [];
  const client = createOpenRouterModelClient({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      requests.push({ body: init.body as string });
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: '{"title":"Recovered"}' } }] };
        },
      };
    },
  });

  await client.complete({
    runId: 'run_schema',
    purpose: 'problem_recovery',
    prompt: 'recover',
    model: 'openrouter/test-model',
    responseSchema: {
      name: 'problem_recovery',
      schema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false,
      },
    },
  });

  const body = JSON.parse(requests[0]!.body);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.name, 'problem_recovery');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema.required, ['title']);
});

test('openrouter model client rejects missing server-side API keys', () => {
  assert.throws(() => createOpenRouterModelClient({ apiKey: '' }), /OPENROUTER_API_KEY is required/);
});
