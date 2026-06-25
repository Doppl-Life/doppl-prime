// A ModelClient backed by a local, already-authenticated CLI (claude / codex / gemini / grok).
// It runs the command headless with the prompt as the final argument and treats stdout as the model
// output. This is the automated "harness bridge": your subscription, no API key, no manual paste —
// the output flows through the same node-compiler/sink pipeline into the vault as any other provider.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ModelCallRecord, ModelCallRequest, ModelClient } from './model-gateway.ts';

const execFileAsync = promisify(execFile);

// The shell-out, isolated behind a seam so tests can inject a fake runner with no child process.
export type CliRunner = (cmd: string, args: string[]) => Promise<{ stdout: string }>;

export type CliModelClientInput = {
  cmd: string; // the binary, e.g. 'claude'
  headless: string[]; // headless flags that precede the prompt, e.g. ['-p']
  provider?: string; // record label; defaults to cmd
  run?: CliRunner; // injectable for tests
};

const defaultRunner: CliRunner = async (cmd, args) =>
  execFileAsync(cmd, args, { maxBuffer: 16 * 1024 * 1024 });

// CLIs don't enforce a response format the way an HTTP `response_format` does — they often wrap JSON
// in prose or a markdown fence. Extract the first balanced JSON value so the structured stages can
// parse it; fall back to the raw text if none is found (let downstream parse/repair decide).
export function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = (fenced ? fenced[1]! : trimmed).trim();
  const start = body.search(/[[{]/);
  if (start === -1) return body;
  const open = body[start]!;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close && --depth === 0) return body.slice(start, i + 1);
  }
  return body;
}

export function createCliModelClient(input: CliModelClientInput): ModelClient {
  if (!input.cmd) throw new Error('cli model client requires a cmd');
  const provider = input.provider || input.cmd;
  const run = input.run || defaultRunner;
  return {
    async complete(request: ModelCallRequest): Promise<ModelCallRecord> {
      const { stdout } = await run(input.cmd, [...input.headless, request.prompt]);
      const wantsJson = Boolean(request.responseSchema) || request.responseFormat === 'json_object';
      return {
        id: `call_${request.runId}_${request.purpose}_${Date.now()}`,
        runId: request.runId,
        purpose: request.purpose,
        provider,
        model: request.model || input.cmd,
        prompt: request.prompt,
        outputText: wantsJson ? extractJsonPayload(stdout) : stdout.trim(),
        metadata: { cli: input.cmd },
      };
    },
  };
}
