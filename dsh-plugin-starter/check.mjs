// Validate the starter bundles in this directory: JSON manifest, YAML patch,
// and ESM syntax of any plugin entry module.
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.';
let failures = 0;

function ok(msg) { console.log(`  ok    ${msg}`); }
function bad(msg) { failures += 1; console.log(`  FAIL  ${msg}`); }

/** 列出一个模块里 import 的 `@deepseek-ai/*` 裸包名，用于把"解析不到"讲清楚。 */
async function bareDeepseekImports(file) {
  const source = await readFile(file, 'utf8');
  const found = new Set();
  for (const match of source.matchAll(/from\s+['"](@deepseek-ai\/[^'"]+)['"]/g)) {
    found.add(match[1]);
  }
  return [...found];
}

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = path.join(root, entry.name);
  console.log(`\n[${entry.name}]`);

  const pkgPath = path.join(dir, 'package.json');
  if (!existsSync(pkgPath)) { bad('package.json missing'); continue; }
  let pkg;
  try { pkg = JSON.parse(await readFile(pkgPath, 'utf8')); } catch (e) { bad(`package.json invalid JSON: ${e.message}`); continue; }
  ok(`package.json parsed (${pkg.name})`);

  if (!pkg.dsh?.bundle?.patch) { bad('package.json does not declare dsh.bundle.patch'); continue; }
  ok(`dsh.bundle.patch = ${pkg.dsh.bundle.patch}`);

  const patchPath = path.join(dir, pkg.dsh.bundle.patch);
  if (!existsSync(patchPath)) { bad(`${pkg.dsh.bundle.patch} missing`); continue; }
  const patchText = await readFile(patchPath, 'utf8');
  const isArray = /^\s*-/m.test(patchText);
  if (!isArray) bad('patch is not a top-level YAML array');
  else ok('patch looks like a top-level YAML array');

  // Row ids and plugin names are what other layers address; surface them.
  const rows = [...patchText.matchAll(/^\s*-?\s*id:\s*(\S+)/gm)].map((m) => m[1]);
  const names = [...patchText.matchAll(/name:\s*'?([^'\n]+)'?/g)].map((m) => m[1].trim());
  ok(`rows=[${rows.join(', ')}]`);
  ok(`names=[${names.join(', ')}]`);

  for (const key of ['exports', 'main']) {
    const target = key === 'exports'
      ? (typeof pkg.exports === 'string' ? pkg.exports : pkg.exports?.['.'])
      : pkg[key];
    const rel = typeof target === 'string' ? target : target?.default;
    if (!rel) continue;
    const file = path.join(dir, rel);
    if (!existsSync(file)) { bad(`${key} -> ${rel} missing`); continue; }
    if (!file.endsWith('.js')) { ok(`${key} -> ${rel}`); continue; }
    try {
      await import(`file://${file.replaceAll('\\', '/')}`);
      ok(`${rel} imports as an ES module`);
    } catch (e) {
      // 包里的 `@deepseek-ai/*` 是 DSH 提供的 peer：在工作区里永远解析不到，
      // 但在 profile 里能。这不算失败 —— 但要显式说出来，避免"静默通过"。
      if (/Cannot find package '@deepseek-ai\//.test(e.message)) {
        const specifiers = await bareDeepseekImports(file);
        ok(`${rel} 语法有效；${specifiers.length} 个 @deepseek-ai/* 依赖在 DSH 中解析`
          + (specifiers.length > 0 ? `（${specifiers.join(', ')}）` : ''));
      } else {
        bad(`${rel} failed to import: ${e.message}`);
      }
    }
  }
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
process.exitCode = failures === 0 ? 0 : 1;
