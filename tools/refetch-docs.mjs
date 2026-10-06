/**
 * 一次性修复脚本：把 asar 里所有 @deepseek-ai 包的 README 与官方 skill 文档
 * 按正确偏移重新导出。
 *
 * 背景：早期版本的 tools/asar-dump.js 把 baseOffset 算成 `16 + headerSize`，
 * 多出 8 字节，导致每个导出文件的**开头丢掉 8 个字符**。对 README 几乎看不出来，
 * 但会让被提取的源码首行看起来像语法错误。本脚本用于把已有文档刷新一遍。
 *
 * 用法：
 *   node refetch-docs.mjs <asar> <输出目录>
 */
import fs from 'node:fs';
import path from 'node:path';

const asar = process.argv[2];
const destRoot = process.argv[3];
if (!asar || !destRoot) {
  console.error('usage: refetch-docs.mjs <asar> <destDir>');
  process.exit(2);
}

const fd = fs.openSync(asar, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const pickleSize = head.readUInt32LE(4);
const pickleSize2 = head.readUInt32LE(8);
const jsonSize = head.readUInt32LE(12);
if (jsonSize !== pickleSize - 8 || pickleSize !== pickleSize2 + 4) {
  throw new Error(`asar 头部结构与预期不符：${pickleSize}/${pickleSize2}/${jsonSize}`);
}
const baseOffset = 16 + jsonSize;
const jsonBuf = Buffer.alloc(jsonSize);
fs.readSync(fd, jsonBuf, 0, jsonSize, 16);
const tree = JSON.parse(jsonBuf.toString('utf8'));

/** 挑选：所有 @deepseek-ai 包自身的 README（含 .zh.md），加上 skill 的 .md。 */
function wanted(p) {
  const PREFIX = '/dsh/node_modules/@deepseek-ai/';
  if (!p.startsWith(PREFIX)) return false;
  const rest = p.slice(PREFIX.length);
  // 排除包内嵌套的 node_modules（例如 dsh-skill-filesystem/node_modules/chokidar/...）。
  if (rest.includes('/node_modules/')) return false;
  return /README(\.[a-z]{2})?\.md$/i.test(p)
    || /\/skills\/.*\.md$/i.test(p);
}

function flatten(target) {
  return target.replace(/^\/dsh\/node_modules\//, '').replace(/^\//, '').replace(/\//g, '__');
}

let written = 0;
let bytes = 0;
let scanned = 0;
let deepseekPaths = 0;
const malformed = [];
const samplePaths = [];
const allEntries = (function walk(node, prefix, out) {
  for (const [name, child] of Object.entries(node.files || {})) {
    const full = `${prefix}/${name}`;
    if (child.files) walk(child, full, out);
    else out.push([full, child]);
  }
  return out;
})(tree, '', []);

console.log(`归档内共有 ${allEntries.length} 个文件条目`);

for (const [p, entry] of allEntries) {
  scanned += 1;
  if (p.startsWith('/dsh/node_modules/@deepseek-ai/')) {
    deepseekPaths += 1;
    if (samplePaths.length < 3) samplePaths.push(p);
  }
  if (!wanted(p)) continue;

  // 目录节点、符号链接或不带 offset 的条目没有可读的数据段。
  // 静默跳过它们比让整个脚本崩掉更合适，但要计数以便发现异常。
  if (!Number.isInteger(entry.size) || entry.offset === undefined
      || !Number.isFinite(Number(entry.offset))) {
    malformed.push(p);
    continue;
  }

  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, baseOffset + Number(entry.offset));
  const dest = path.join(destRoot, flatten(p));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  written += 1;
  bytes += entry.size;
}

console.log(`扫描 ${scanned} 条，其中 @deepseek-ai 路径 ${deepseekPaths} 条`);
if (malformed.length > 0) {
  console.log(`跳过 ${malformed.length} 条无数据段的条目，例如：${JSON.stringify(malformed.slice(0, 3))}`);
}

fs.closeSync(fd);
console.log(`重新导出 ${written} 个文件，共 ${bytes} 字节 -> ${destRoot}`);
