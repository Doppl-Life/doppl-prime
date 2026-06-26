import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createOpenRouterModelClient,
  createOpenAICompatibleModelClient,
  createRoutingModelClient,
  createFusionModelClient,
  createReplayModelClient,
  createRecordingModelClient,
  parseJsonObjectResponse,
  readModelCallRecords,
  writeModelCallRecords,
  type ModelCallRecord,
  type ModelClient,
} from '../../src/kernel/model-gateway.ts';

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

test('replay model client can map a recorded source run to a new target run', async () => {
  const replay = createReplayModelClient(
    [
      {
        id: 'call_1',
        runId: 'source_run',
        purpose: 'candidate_generation',
        provider: 'replay',
        model: 'fixture-model',
        prompt: 'generate for source_run',
        outputText: '{"candidates":[]}',
        metadata: {},
      },
    ],
    { sourceRunId: 'source_run', targetRunId: 'target_run' },
  );

  const response = await replay.complete({
    runId: 'target_run',
    purpose: 'candidate_generation',
    prompt: 'generate for target_run',
    model: 'fixture-model',
  });

  assert.equal(response.runId, 'source_run');
  assert.equal(response.outputText, '{"candidates":[]}');
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

test('openai-compatible client omits auth for local providers and labels the provider', async () => {
  let captured: { headers: Record<string, string> } | undefined;
  const client = createOpenAICompatibleModelClient({
    baseUrl: 'http://localhost:11434/v1/chat/completions',
    provider: 'ollama',
    fetch: async (_url, init) => {
      captured = { headers: init.headers as Record<string, string> };
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: '{"ok":true}' } }] }; } };
    },
  });

  const record = await client.complete({ runId: 'r', purpose: 'problem_recovery', prompt: 'p', model: 'llama3.1' });

  assert.equal(captured?.headers.Authorization, undefined, 'local provider sends no Authorization header');
  assert.equal(record.provider, 'ollama');
  assert.equal(record.outputText, '{"ok":true}');
});

test('routing client overrides model by purpose and pins the judge', async () => {
  const seen: Array<{ purpose: string; model: string }> = [];
  const stub: ModelClient = {
    async complete(request) {
      seen.push({ purpose: request.purpose, model: request.model });
      return { id: 'c', runId: request.runId, purpose: request.purpose, provider: 'stub', model: request.model, prompt: request.prompt, outputText: '{}', metadata: {} };
    },
  };
  const routed = createRoutingModelClient(stub, { candidate_generation: 'strong-model', critic_judgment: 'pinned-judge' });

  await routed.complete({ runId: 'r', purpose: 'candidate_generation', prompt: 'g', model: 'default' });
  await routed.complete({ runId: 'r', purpose: 'critic_judgment', prompt: 'j', model: 'default' });
  await routed.complete({ runId: 'r', purpose: 'problem_recovery', prompt: 'pr', model: 'default' });

  assert.deepEqual(seen, [
    { purpose: 'candidate_generation', model: 'strong-model' },
    { purpose: 'critic_judgment', model: 'pinned-judge' },
    { purpose: 'problem_recovery', model: 'default' },
  ]);
});

test('fusion client fans out to each model then synthesizes one fused response', async () => {
  const calls: Array<{ purpose: string; model: string }> = [];
  const stub: ModelClient = {
    async complete(request) {
      calls.push({ purpose: request.purpose, model: request.model });
      return { id: `c_${calls.length}`, runId: request.runId, purpose: request.purpose, provider: 'openrouter', model: request.model, prompt: request.prompt, outputText: `draft-${request.model}`, metadata: {} };
    },
  };
  const fusion = createFusionModelClient({ client: stub, models: ['model-a', 'model-b'] });

  const record = await fusion.complete({ runId: 'r', purpose: 'candidate_generation', prompt: 'task', model: 'ignored' });

  assert.deepEqual(calls.map((c) => c.model), ['model-a', 'model-b', 'model-a'], 'two drafts then one synthesis');
  assert.deepEqual(calls.map((c) => c.purpose), [
    'candidate_generation:fusion_draft',
    'candidate_generation:fusion_draft',
    'candidate_generation:fusion_synthesis',
  ]);
  assert.equal(record.purpose, 'candidate_generation', 'fused record reports the original purpose');
  assert.equal(record.provider, 'fusion:openrouter');
  assert.deepEqual(record.metadata.fusionModels, ['model-a', 'model-b']);
  assert.equal(record.prompt, 'task', 'fused record keeps the original prompt');
});

test('fusion requires at least two models', () => {
  assert.throws(() => createFusionModelClient({ client: {} as ModelClient, models: ['solo'] }), /at least two models/);
});
