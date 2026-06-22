import { runKernel } from './run-kernel.ts';
import { exportRunToVault } from './vault-export.ts';
import { writeProofBoard } from './proof-board.ts';

export const defaultKernelArgs = {
  runId: 'run_fsd_ownership_fixture',
  casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
  fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
  knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
  memoryMode: 'auto' as const,
  outDir: 'kernel/out/vault',
  proofBoardDir: 'kernel/out/proof-board',
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = await runKernel(defaultKernelArgs);
  const manifest = await exportRunToVault(run, defaultKernelArgs.outDir);
  const proofBoard = await writeProofBoard(run, defaultKernelArgs.proofBoardDir);
  console.log(
    JSON.stringify(
      {
        runId: run.id,
        caseId: run.caseStudy.id,
        problemRecovery: run.problemRecovery.id,
        candidates: run.candidates.length,
        child: run.fusion?.child.id || null,
        proofBoard,
        files: manifest.files,
      },
      null,
      2,
    ),
  );
}
