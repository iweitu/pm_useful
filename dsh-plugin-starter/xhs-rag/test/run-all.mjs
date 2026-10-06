/**
 * 跑全部离线测试。
 *
 *   node test/run-all.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const suites = ['offline.test.mjs', 'search.test.mjs', 'store.test.mjs'];
let failed = 0;

for (const suite of suites) {
  console.log(`\n${'='.repeat(60)}\n${suite}\n${'='.repeat(60)}`);
  const result = spawnSync(process.execPath, [join(here, suite)], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
}

console.log(`\n${'='.repeat(60)}`);
if (failed === 0) {
  console.log(`全部 ${suites.length} 个测试套件通过`);
} else {
  console.log(`${failed}/${suites.length} 个测试套件失败`);
  process.exitCode = 1;
}
