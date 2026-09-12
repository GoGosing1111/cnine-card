import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = Number(process.env.FORGE_PREVIEW_PORT || 8899);
const prefixes = ['/preview/equipment-forge-v1/', '/assets/ui/project-v/account-battle-suits/weapons/', '/assets/sfx/v3-advancement-awakening-v1/'];
const exact = ['/js/ui-fx-vendor-v2045.bundle.js'];
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  const fail = status => { res.writeHead(status, { 'content-type': 'text/plain' }); res.end('Local preview only'); };
  try {
    if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) return fail(403);
    if (!['GET', 'HEAD'].includes(req.method)) return fail(405);
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    if (url.pathname === '/') { res.writeHead(302, { location: '/preview/equipment-forge-v1/' }); res.end(); return; }
    const route = decodeURIComponent(url.pathname);
    if (!prefixes.some(prefix => route.startsWith(prefix)) && !exact.includes(route)) return fail(404);
    let file = path.resolve(root, '.' + route);
    if (!file.startsWith(root + path.sep) || route.split(/[\\/]/).some(segment => segment.startsWith('.'))) return fail(403);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.realpathSync(file).startsWith(root + path.sep)) return fail(404);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  } catch { fail(404); }
}).listen(port, '127.0.0.1', () => console.log('Equipment forge review: http://127.0.0.1:' + port + '/preview/equipment-forge-v1/'));
