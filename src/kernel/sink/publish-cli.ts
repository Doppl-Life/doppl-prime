import { defaultKernelArgs } from '../cli.ts';
import { publishStaticKernelRun, writePublishedIndex } from './publish.ts';
import { runChain } from '../engine/run-kernel.ts';

const { doppl: run } = await runChain(defaultKernelArgs);
const manifest = await publishStaticKernelRun(run, defaultKernelArgs.publishDir);
const siteIndex = await writePublishedIndex('published', {
  kernelHref: 'kernel/',
  kernelTitle: 'Doppl Kernel Proof Board',
  runId: run.id,
});

console.log(
  JSON.stringify(
    {
      runId: run.id,
      caseId: run.caseStudy.id,
      siteIndex,
      published: manifest.indexHtml,
      files: manifest.files,
    },
    null,
    2,
  ),
);
