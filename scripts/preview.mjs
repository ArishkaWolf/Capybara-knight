import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf' };
const port = Number(process.env.PORT ?? 4173);
const lan = process.argv.includes('--lan');
const baseArgument = process.argv.indexOf('--base-path');
const basePath = baseArgument < 0 ? '' : (process.argv[baseArgument + 1] ?? '').replace(/\/$/, '');
if (basePath && !/^\/[A-Za-z0-9_-]+$/.test(basePath)) throw new Error('Use a single project path, such as /Capybara-knight');
http.createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (basePath && pathname === basePath) { response.writeHead(302, { Location: `${basePath}/` }); response.end(); return; }
    if (basePath && !pathname.startsWith(`${basePath}/`)) throw new Error('Outside project');
    pathname = pathname.slice(basePath.length);
    const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(root + path.sep) && target !== root) { response.writeHead(403); response.end(); return; }
    if (!(await stat(target)).isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    response.end(await readFile(target));
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Статическая версия: http://localhost:${port}${basePath}/`);
  if (lan) for (const addresses of Object.values(networkInterfaces())) for (const address of addresses ?? []) {
    if (address.family === 'IPv4' && !address.internal) console.log(`Телефон в той же Wi-Fi сети: http://${address.address}:${port}${basePath}/`);
  }
});
