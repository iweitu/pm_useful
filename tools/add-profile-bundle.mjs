#!/usr/bin/env node
/**
 * add-profile-bundle.mjs — 把包名幂等地加进 DSH profile 的 dsh.profile.bundles。
 *
 * 用途：用 CLI 路径安装一个本地 agent bundle 时，`pnpm add file:<dir>` 只负责把包
 * 放进 profile 的 node_modules，还要把它登记进 bundle 列表，配置树才会叠加它这一层。
 * 手工改 package.json 容易漏字段或改坏格式，这个脚本只动该动的那个数组。
 *
 * 这**不是** install_bundle 的替代品：能进创造模式的会话时，优先让 agent 用
 * plugin_manager 的 install_bundle（它自己完成包安装与 bundle 选择）。
 *
 * 依赖：任意 Node.js（桌面版自带的即可）。
 *
 * 用法：
 *   node add-profile-bundle.mjs <profile 目录 | package.json 路径> <包名...> [--dry-run]
 *
 * 示例：
 *   $node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
 *   # 先看会改什么
 *   & $node .\tools\add-profile-bundle.mjs "$env:DSH_PROFILE_DIR" "@local/dsh-prd-partner" --dry-run
 *   # 再真正写入（建议先自行备份 package.json 与 pnpm-lock.yaml）
 *   & $node .\tools\add-profile-bundle.mjs "$env:DSH_PROFILE_DIR" "@local/dsh-prd-partner"
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const rest = argv.filter((a) => a !== '--dry-run');
const [target, ...names] = rest;

if (!target || names.length === 0) {
  console.error('usage: node add-profile-bundle.mjs <profile dir | package.json> <bundle name...> [--dry-run]');
  process.exit(2);
}

const pkgPath = existsSync(target) && statSync(target).isDirectory()
  ? path.join(target, 'package.json')
  : target;
if (!existsSync(pkgPath)) {
  console.error(`package.json not found: ${pkgPath}`);
  process.exit(2);
}

const raw = readFileSync(pkgPath, 'utf8');
let pkg;
try {
  pkg = JSON.parse(raw);
} catch (e) {
  console.error(`invalid JSON in ${pkgPath}: ${e.message}`);
  process.exit(1);
}

pkg.dsh ??= {};
pkg.dsh.profile ??= {};
pkg.dsh.profile.bundles ??= [];
if (!Array.isArray(pkg.dsh.profile.bundles)) {
  console.error('dsh.profile.bundles exists but is not a list; refusing to rewrite it');
  process.exit(1);
}

const before = [...pkg.dsh.profile.bundles];
const added = [];
for (const name of names) {
  if (!pkg.dsh.profile.bundles.includes(name)) {
    pkg.dsh.profile.bundles.push(name);
    added.push(name);
  }
}

console.log(`target : ${pkgPath}`);
console.log(`before : ${JSON.stringify(before)}`);
console.log(`after  : ${JSON.stringify(pkg.dsh.profile.bundles)}`);

if (added.length === 0) {
  console.log('result : unchanged (already present)');
  process.exit(0);
}
if (dryRun) {
  console.log(`result : dry-run, would add ${JSON.stringify(added)}`);
  process.exit(0);
}

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`result : wrote ${JSON.stringify(added)}`);
