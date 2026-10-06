#!/usr/bin/env node
/**
 * asar-dump.js — 读取 Electron asar 归档里的文件（只读，无第三方依赖）。
 *
 * 用途：DSH 桌面版把全部插件包和包内 README 放在
 *   G:\DeepSeek_Harness\resources\app.asar
 * 里。PowerShell、ripgrep、glob 都打不开 asar，只有 Host 进程自己的读取能进去，
 * 所以用这个脚本把需要的文件导出来再读。
 *
 * 依赖：任何 Node.js（桌面版自带的即可，见文末示例）。
 *
 * 用法：
 *   node asar-dump.js list   <asar> [正则过滤路径]
 *   node asar-dump.js cat    <asar> <归档内路径>
 *   node asar-dump.js get    <asar> <输出目录> <归档内路径> [更多路径...]
 *   node asar-dump.js getdir <asar> <输出目录> <归档内目录>
 *
 * `get` 把每个文件扁平化成 `<包>__<路径>` 单文件；`getdir` 抽取整个目录并
 * **保留相对结构**，因此导出的包（如 @deepseek-ai/dsh-* 依赖的 yaml 解析器）
 * 可以直接被 require。
 *
 * 示例：
 *   $node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
 *   & $node .\tools\asar-dump.js list "G:\DeepSeek_Harness\resources\app.asar" "cordis-plugin-development"
 *   & $node .\tools\asar-dump.js cat  "G:\DeepSeek_Harness\resources\app.asar" "/dsh/node_modules/@deepseek-ai/dsh-tools/README.zh.md"
 *   & $node .\tools\asar-dump.js get  "G:\DeepSeek_Harness\resources\app.asar" .\dsh-docs "/dsh/node_modules/@deepseek-ai/dsh/README.zh.md"
 *   & $node .\tools\asar-dump.js getdir "G:\DeepSeek_Harness\resources\app.asar" "$env:TEMP\dsh-yaml-lib" "/dsh/node_modules/yaml"
 */

const fs = require('fs');
const path = require('path');

function loadTree(asar) {
  const fd = fs.openSync(asar, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const pickleSize = head.readUInt32LE(4);
  const pickleSize2 = head.readUInt32LE(8);
  const jsonSize = head.readUInt32LE(12);
  const jsonBuf = Buffer.alloc(jsonSize);
  fs.readSync(fd, jsonBuf, 0, jsonSize, 16);
  const tree = JSON.parse(jsonBuf.toString('utf8'));

  // 文件数据的起点是 `16 + jsonSize`（等同 `8 + pickleSize`）。
  //
  // 这里曾经写成 `16 + pickleSize`，多算 8 字节，导致**每个导出文件的开头
  // 丢掉 8 个字节**。对 README 这类文本几乎看不出来（只是首行前 8 个字符没了），
  // 但会让被提取的源码首行看起来像语法错误，非常容易误导人。
  // 断言：jsonSize = pickleSize - 8，且数据区从 16 + jsonSize 开始。
  const baseOffset = 16 + jsonSize;
  if (baseOffset !== 8 + pickleSize || jsonSize !== pickleSize - 8 || pickleSize !== pickleSize2 + 4) {
    throw new Error(
      `asar 头部结构与预期不符，拒绝按猜测的偏移读取：`
      + `pickleSize=${pickleSize} pickleSize2=${pickleSize2} jsonSize=${jsonSize}`,
    );
  }
  return { fd, tree, baseOffset };
}

function resolveNode(tree, target) {
  let node = tree;
  for (const part of target.split('/').filter(Boolean)) {
    if (!node.files || !node.files[part]) return null;
    node = node.files[part];
  }
  return node.files ? null : node;
}

function readEntry(fd, baseOffset, node) {
  const buf = Buffer.alloc(node.size);
  fs.readSync(fd, buf, 0, node.size, baseOffset + Number(node.offset));
  return buf;
}

/** 归档内路径 -> 扁平化的本地文件名，保持包名可辨认。 */
function flatten(target) {
  return target
    .replace(/^\/dsh\/node_modules\//, '')
    .replace(/^\//, '')
    .replace(/\//g, '__');
}

const [command, asar, ...rest] = process.argv.slice(2);

if (!command || !asar) {
  console.error('usage: asar-dump.js list|cat|get <asar> [...]');
  process.exit(2);
}

const { fd, tree, baseOffset } = loadTree(asar);

if (command === 'list') {
  const filter = rest[0] ? new RegExp(rest[0], 'i') : null;
  const out = [];
  (function walk(node, prefix) {
    for (const [name, entry] of Object.entries(node.files || {})) {
      const p = `${prefix}/${name}`;
      if (entry.files) walk(entry, p);
      else out.push({ path: p, size: entry.size });
    }
  })(tree, '');
  const shown = filter ? out.filter((e) => filter.test(e.path)) : out;
  for (const e of shown) console.log(`${String(e.size).padStart(9)}  ${e.path}`);
  console.error(`total=${out.length} shown=${shown.length}`);
} else if (command === 'cat') {
  const node = resolveNode(tree, rest[0] ?? '');
  if (!node) {
    console.error(`not found: ${rest[0]}`);
    process.exit(1);
  }
  process.stdout.write(readEntry(fd, baseOffset, node));
} else if (command === 'get') {
  const [destRoot, ...targets] = rest;
  let failures = 0;
  for (const target of targets) {
    const node = resolveNode(tree, target);
    if (!node) {
      console.error(`MISS ${target}`);
      failures += 1;
      continue;
    }
    const dest = path.join(destRoot, flatten(target));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, readEntry(fd, baseOffset, node));
    console.log(`OK   ${String(node.size).padStart(8)}  ${dest}`);
  }
  if (failures > 0) process.exitCode = 1;
} else if (command === 'getdir') {
  const [destRoot, target] = rest;
  if (!destRoot || !target) {
    console.error('usage: asar-dump.js getdir <asar> <输出目录> <归档内目录>');
    process.exit(2);
  }
  const prefix = target.replace(/\/+$/, '');
  let count = 0;
  let bytes = 0;
  (function walk(node, p) {
    for (const [name, entry] of Object.entries(node.files || {})) {
      const full = `${p}/${name}`;
      if (entry.files) walk(entry, full);
      else if (full.startsWith(`${prefix}/`)) {
        const dest = path.join(destRoot, full.slice(prefix.length + 1));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, readEntry(fd, baseOffset, entry));
        count += 1;
        bytes += entry.size;
      }
    }
  })(tree, '');
  if (count === 0) {
    console.error(`no files under: ${target}`);
    process.exitCode = 1;
  } else {
    console.log(`OK   ${count} files (${bytes} bytes) -> ${destRoot}`);
  }
} else {
  console.error(`unknown command: ${command}`);
  process.exit(2);
}

fs.closeSync(fd);
