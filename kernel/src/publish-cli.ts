import { defaultKernelArgs } from './cli.ts';
import { publishStaticKernelRun } from './publish.ts';
import { runKernel } from './run-kernel.ts';

const run = await runKernel(defaultKernelArgs);
const manifest = await publishStaticKernelRun(run, defaultKernelArgs.publishDir);

console.log(
  JSON.stringify(
    {
      runId: run.id,
      caseId: run.caseStudy.id,
      published: manifest.indexHtml,
      files: manifest.files,
    },
    null,
    2,
  ),
);
