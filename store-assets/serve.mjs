// Local server for rendering store screenshots of the real popup.
// popup/popup.html?mock=<scene>&lang=<ko|en> gets chrome-stub.js injected
// so it runs outside the extension with canned data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const port = Number(process.argv[2] || 8765);

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  let body = fs.readFileSync(file);
  if (url.pathname === '/popup/popup.html' && url.searchParams.has('mock')) {
    body = body.toString().replace('<script type="module"', '<script src="/store-assets/chrome-stub.js"></script>\n  <script type="module"');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
}).listen(port, () => console.log(`http://localhost:${port}`));
