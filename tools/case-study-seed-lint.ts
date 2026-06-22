import { listCaseStudySlugs, loadCaseStudySeedView } from './case-study-corpus.ts';
import { runMain } from './cli.ts';

async function main(): Promise<void> {
  const slugs = await listCaseStudySlugs();
  const failures: string[] = [];

  for (const slug of slugs) {
    try {
      await loadCaseStudySeedView(slug);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${slug}: ${message}`);
    }
  }

  if (failures.length) {
    console.error(`seed leakage lint failed: ${failures.length}/${slugs.length}`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`seed leakage lint passed: ${slugs.length} case(s)`);
}

runMain(import.meta.url, main);
