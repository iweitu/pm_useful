// 校验一个 workspace 内的 agent bundle（package.json + cordis.patch.yml）。
//
//   node tools/verify-agent-bundle.mjs <bundleDir> [...moreDirs]
//     [--yaml <path to yaml dist/index.js>]     缺省时尝试 import('yaml')
//     [--packages <path to cordis-composition-reference/references/packages.md>]
//
// 校验内容：manifest 形状、patch 是顶层数组、补丁条目方言（insert / 按 id 覆盖）、
// cordis:group 行必须带 group: true、agent preset 声明的必填字段与 id 语法、
// 同一 preset 内行 id 不重复、以及每个插件 name 都存在于 DSH 的可加载包清单中。
//
// 它做的是静态校验：不加载插件、不接触运行中的 Host，因此不能替代安装后的
// list_plugins 激活检查。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opts = { yaml: null, packages: null, dump: false };
const dirs = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--yaml') opts.yaml = argv[++i];
  else if (argv[i] === '--packages') opts.packages = argv[++i];
  else if (argv[i] === '--dump') opts.dump = true;
  else dirs.push(argv[i]);
}
if (dirs.length === 0) {
  console.error('usage: node tools/verify-agent-bundle.mjs <bundleDir> [--yaml <yaml/index.js>] [--packages <packages.md>]');
  process.exit(2);
}

let failures = 0;
let notes = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { failures += 1; console.log(`  FAIL  ${m}`); };
const note = (m) => { notes += 1; console.log(`  note  ${m}`); };

async function loadYaml() {
  const target = opts.yaml && existsSync(path.join(opts.yaml, 'index.js'))
    ? path.join(opts.yaml, 'index.js')
    : opts.yaml;
  try {
    return target ? await import(pathToFileURL(target).href) : await import('yaml');
  } catch (e) {
    console.error(`cannot load a YAML parser (${e.message}); pass --yaml <path to yaml/dist/index.js>`);
    process.exit(2);
  }
}
const yaml = await loadYaml();

// 可加载包白名单：cordis-composition-reference/references/packages.md 的第一列。
let registry = null;
if (opts.packages) {
  if (!existsSync(opts.packages)) bad(`--packages not found: ${opts.packages}`);
  else {
    const list = new Set();
    for (const line of readFileSync(opts.packages, 'utf8').split(/\r?\n/)) {
      const m = /^\|\s*`([^`]+)`\s*\|/.exec(line);
      if (m) list.add(m[1]);
    }
    registry = list;
    ok(`loaded ${list.size} loadable package names from ${path.basename(opts.packages)}`);
  }
}
const inRegistry = (name) => {
  if (!registry) return true;
  if (registry.has(name)) return true;
  const base = name.split('/').slice(0, 2).join('/');
  return [...registry].some((known) => name === known || name.startsWith(`${known}/`)) || registry.has(base);
};

const BUILTINS = new Set(['cordis:group', 'cordis:include']);

function parsePatch(text) {
  try {
    return { doc: yaml.parse(text), degraded: false };
  } catch (e) {
    // !!js 是 Loader 表达式，不是标准 YAML tag；降级后仍校验结构与包名。
    if (/unresolved tag|!!js/i.test(e.message)) {
      return { doc: yaml.parse(text.replace(/!!js\s+/g, '')), degraded: true };
    }
    throw e;
  }
}

function checkRowList(rows, trail, seen) {
  rows.forEach((row, i) => {
    const where = `${trail}[${i}]`;
    if (!row || typeof row !== 'object') return bad(`${where} is not a mapping`);
    if (!row.name) return bad(`${where} has no name`);
    if (row.id) {
      if (seen.has(row.id)) bad(`duplicate row id "${row.id}"`);
      seen.add(row.id);
    }
    if (row.name === 'cordis:group') {
      if (row.group !== true) bad(`${where} (${row.id ?? '?'}) uses cordis:group without group: true`);
      if (!Array.isArray(row.config)) bad(`${where} (${row.id ?? '?'}) group config must be a list`);
      else checkRowList(row.config, `${where}.config`, seen);
      return;
    }
    if (BUILTINS.has(row.name)) return;
    if (!inRegistry(row.name)) bad(`${where} names unknown package "${row.name}"`);
  });
}

for (const dir of dirs) {
  console.log(`\n[${dir}]`);
  const pkgPath = path.join(dir, 'package.json');
  if (!existsSync(pkgPath)) { bad('package.json missing'); continue; }
  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch (e) { bad(`package.json invalid JSON: ${e.message}`); continue; }
  ok(`package.json parsed (${pkg.name ?? 'unnamed'})`);
  if (!pkg.private) note('package.json is not marked private');
  if (!pkg.dsh?.bundle?.patch) { bad('package.json does not declare dsh.bundle.patch'); continue; }

  const patchPath = path.join(dir, pkg.dsh.bundle.patch);
  if (!existsSync(patchPath)) { bad(`${pkg.dsh.bundle.patch} missing`); continue; }
  const text = readFileSync(patchPath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) bad('patch file starts with a UTF-8 BOM');
  if (!/^\s*-/m.test(text)) bad('patch does not look like a top-level YAML array');

  let doc;
  try {
    const parsed = parsePatch(text);
    doc = parsed.doc;
    if (parsed.degraded) note('patch contains !!js expressions; structural check only');
  } catch (e) {
    bad(`patch is not valid YAML: ${e.message}`);
    continue;
  }
  if (!Array.isArray(doc)) { bad('patch root is not a list'); continue; }
  ok(`patch parsed as a top-level array of ${doc.length} entry(ies)`);

  const seen = new Set();
  const presets = [];
  let inserted = 0;
  doc.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') return bad(`patch[${i}] is not a mapping`);
    if (entry.insert !== undefined) {
      if (!Array.isArray(entry.insert)) return bad(`patch[${i}].insert is not a list`);
      inserted += entry.insert.length;
      checkRowList(entry.insert, `patch[${i}].insert`, seen);
      for (const row of entry.insert) {
        if (row?.name === '@deepseek-ai/dsh-agent-preset') presets.push(row);
      }
      return;
    }
    if (!entry.id) return bad(`patch[${i}] has neither insert nor a nonempty id`);
    if (entry.name === '@deepseek-ai/dsh-agent-preset') presets.push(entry);
  });
  ok(`patch inserts ${inserted} row(s); ${presets.length} agent-preset declaration(s)`);

  if (presets.length === 0) bad('no @deepseek-ai/dsh-agent-preset declaration found');
  for (const preset of presets) {
    const cfg = preset.config ?? {};
    const label = `preset "${cfg.id ?? '(no config.id)'}"`;
    if (!cfg.id || !/^[a-z][a-z0-9-]*$/.test(cfg.id)) bad(`${label}: config.id must be lowercase letters, digits and hyphens`);
    if (preset.id && cfg.id && preset.id !== `preset-${cfg.id}`) {
      note(`${label}: loader row id is "${preset.id}", convention is "preset-${cfg.id}"`);
    }
    if (typeof cfg.order !== 'number') note(`${label}: no numeric order`);
    if (!Array.isArray(cfg.plugins)) { bad(`${label}: config.plugins must be a list`); continue; }
    checkRowList(cfg.plugins, `${label}.plugins`, new Set());
    const tools = cfg.plugins.filter((r) => r?.name && !BUILTINS.has(r.name)).length;
    ok(`${label}: ${cfg.plugins.length} top-level plugin row(s), ${tools} package row(s), name="${cfg.name ?? ''}"`);
    const persona = cfg.plugins.find((r) => r?.name === '@deepseek-ai/dsh-persona');
    if (!persona) note(`${label}: no persona row — this preset cannot change the agent's identity`);
    const shells = cfg.plugins.filter((r) => /dsh-tool-(bash|pwsh)|dsh-terminal|dsh-tool-jobs/.test(r?.name ?? ''));
    if (shells.length > 0) note(`${label}: mounts execution tools (${shells.map((s) => s.name).join(', ')})`);
    if (opts.dump) {
      console.log(`\n--- ${label} resolved declaration ---`);
      console.log(JSON.stringify(cfg, null, 2));
    }
  }
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}${notes ? ` with ${notes} note(s)` : ''}`);
process.exitCode = failures === 0 ? 0 : 1;
