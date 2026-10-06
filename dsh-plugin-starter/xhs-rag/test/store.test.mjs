/**
 * 离线测试：笔记存储的持久化与容错。
 *
 * 用临时目录，不碰真实 $DSH_HOME。运行：
 *   node test/store.test.mjs
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openNoteStore } from '../store.js';

let failures = 0;
let checks = 0;

function eq(actual, expected, label) {
  checks += 1;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.log(`  FAIL  ${label}\n        期望 ${b}\n        实际 ${a}`);
  } else {
    console.log(`  ok    ${label}`);
  }
}

function ok(value, label) {
  checks += 1;
  if (!value) {
    failures += 1;
    console.log(`  FAIL  ${label}（期望为真，实际 ${JSON.stringify(value)}）`);
  } else {
    console.log(`  ok    ${label}`);
  }
}

const root = await mkdtemp(join(tmpdir(), 'xhs-rag-test-'));

try {
  // ---------------------------------------------------------- 首次运行
  console.log('\n[首次运行：目录不存在]');
  const filePath = join(root, 'nested', 'storages', 'xhs-rag', 'notes.json');
  const store = await openNoteStore(filePath);
  eq(store.loadError, undefined, '文件不存在不算错误');
  eq(store.size(), 0, '空库');
  ok(!existsSync(filePath), '只读打开不创建文件（避免为了搜索而写盘）');

  // ---------------------------------------------------------- 写入与重载
  console.log('\n[写入与重载]');
  await store.put({
    noteId: 'n1',
    url: 'https://www.xiaohongshu.com/explore/n1',
    title: '租房收纳',
    text: '竖向利用墙面',
    usable: true,
    degraded: [],
    importedAt: '2026-01-01T00:00:00.000Z',
  });
  await store.put({ noteId: 'n2', url: 'u2', title: '厨房清洁', text: '油污', usable: false, degraded: ['正文过短'] });
  eq(store.size(), 2, '内存里有两篇');
  ok(existsSync(filePath), '写入后文件已创建');

  const reloaded = await openNoteStore(filePath);
  eq(reloaded.size(), 2, '重新打开后仍然是两篇');
  eq(reloaded.get('n1')?.title, '租房收纳', '内容完整保留');
  eq(reloaded.get('n2')?.usable, false, 'degraded 标记保留');

  // ---------------------------------------------------------- 覆盖
  console.log('\n[覆盖同一 noteId]');
  await reloaded.put({ noteId: 'n1', url: 'u1', title: '改过的标题', text: 'x', usable: true, degraded: [] });
  eq(reloaded.size(), 2, '覆盖不增加条数');
  eq(reloaded.get('n1')?.title, '改过的标题', '内容被替换');

  // ---------------------------------------------------------- 删除
  console.log('\n[删除]');
  eq(await reloaded.remove('n2'), true, '删除已存在的返回 true');
  eq(await reloaded.remove('n2'), false, '重复删除返回 false');
  eq((await openNoteStore(filePath)).size(), 1, '删除已落盘');

  // ---------------------------------------------------------- 原子写
  console.log('\n[原子写：不留半个文件]');
  const raw = await readFile(filePath, 'utf8');
  ok(raw.trimEnd().endsWith('}'), '文件是完整 JSON');
  const parsed = JSON.parse(raw);
  eq(parsed.version, 1, '带版本号（将来可迁移）');
  ok(Array.isArray(parsed.notes), 'notes 是数组');
  const leftovers = (await import('node:fs/promises')).readdir;
  const files = await leftovers(join(root, 'nested', 'storages', 'xhs-rag'));
  ok(!files.some((f) => f.endsWith('.tmp')), '临时文件已被 rename 消费掉');

  // ---------------------------------------------------------- 损坏文件容错
  console.log('\n[损坏文件：非致命降级]');
  const brokenPath = join(root, 'broken.json');
  await writeFile(brokenPath, '{ 这不是 JSON', 'utf8');
  const broken = await openNoteStore(brokenPath);
  eq(broken.size(), 0, '损坏文件按空库启动');
  ok(typeof broken.loadError === 'string' && broken.loadError.includes('JSON'), '报告了可读的载入错误');
  // 关键：损坏后仍能正常写入，不因为一次坏文件就永久不可用。
  await broken.put({ noteId: 'r1', url: 'u', title: 't', text: 'x', usable: true, degraded: [] });
  eq((await openNoteStore(brokenPath)).size(), 1, '损坏后可恢复写入');

  // ---------------------------------------------------------- 版本不符
  console.log('\n[版本不符]');
  const wrongVersion = join(root, 'v99.json');
  await writeFile(wrongVersion, JSON.stringify({ version: 99, notes: [{ noteId: 'x' }] }), 'utf8');
  const wrong = await openNoteStore(wrongVersion);
  eq(wrong.size(), 0, '不支持的版本按空库启动，不尝试解析');
  ok(wrong.loadError?.includes('版本'), '报告版本问题');

  // ---------------------------------------------------------- 入参校验
  console.log('\n[入参校验]');
  let threw = false;
  try {
    await store.put({ noNoteId: true });
  } catch {
    threw = true;
  }
  ok(threw, '缺少 noteId 时明确抛错');
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`\n${checks - failures}/${checks} 项通过`);
if (failures > 0) {
  console.log(`${failures} 项失败`);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
