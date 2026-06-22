import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package exposes a production start command for the kernel server', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  assert.equal(pkg.scripts.start, 'npm run kernel:serve');
});

test('railway config starts and health-checks the kernel server', async () => {
  const config = JSON.parse(await readFile('railway.json', 'utf8')) as {
    build: Record<string, unknown>;
    deploy: Record<string, unknown>;
  };

  assert.equal(config.build.builder, 'RAILPACK');
  assert.equal(config.deploy.startCommand, 'npm start');
  assert.equal(config.deploy.healthcheckPath, '/health');
  assert.equal(config.deploy.healthcheckTimeout, 30);
});
