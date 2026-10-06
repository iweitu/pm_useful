/**
 * 极简静态服务器：把演示页挂在本地 HTTP 上（零依赖，只在 127.0.0.1 监听）。
 *
 * 用法：node tools/serve.mjs [端口]        默认 8788，端口被占用时自动往后找
 * 打开：http://127.0.0.1:<port>/
 *
 * 为什么需要它：单文件页面直接双击（file://）也能用；但用 http:// 打开的好处是
 * 便于在多个浏览器/设备之间切换、便于截图与录屏，也避免个别浏览器对 file:// 的限制。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));   // demo/rag-decision-agent/
const ENTRY = 'rag-demo-20261006-v4.html';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/' + ENTRY;
    const abs = normalize(join(ROOT, rel));
    if (!abs.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep) && abs !== ROOT) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(abs).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + rel);
      return;
    }
    const body = await readFile(abs);
    res.writeHead(200, {
      'content-type': TYPES[extname(abs).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    }).end(body);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('500 ' + String(e && e.message));
  }
});

const startPort = Number(process.argv[2] || 8788);
let port = startPort;
let tries = 0;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && tries < 10) { tries += 1; port += 1; server.listen(port, '127.0.0.1'); return; }
  console.error('serve failed:', e.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log('demo ready : http://127.0.0.1:' + port + '/');
  console.log('entry page : http://127.0.0.1:' + port + '/' + ENTRY);
  console.log('root       : ' + ROOT);
});
