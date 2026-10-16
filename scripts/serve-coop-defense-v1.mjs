import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DefenseRooms } from '../preview/coop-defense-v1/source/room-service.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
export function createReviewServer({ rooms = new DefenseRooms() } = {}) {
  const send = (res, data, status = 200) => {
    res.writeHead(status, { 'content-type': mime['.json'], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      const url = new URL(req.url, `http://${host}`);
      const localAddress = String(req.socket.localAddress || '').replace(/^::ffff:/, '');
      if (!['localhost', '127.0.0.1', '[::1]', localAddress].includes(url.hostname))
        return send(res, { error: '허용하지 않는 검수 서버 주소입니다.' }, 403);
      if (url.pathname.startsWith('/__coop-defense/v1/')) {
        if (req.headers.origin && req.headers.origin !== `http://${host}`) return send(res, { error: '다른 출처의 요청은 허용하지 않습니다.' }, 403);
        if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, { error: '다른 출처의 요청은 허용하지 않습니다.' }, 403);
        const token = req.headers.authorization?.replace(/^Bearer /, '');
        if (req.method === 'GET' && url.pathname.endsWith('/rooms')) return send(res,rooms.list(url.searchParams.get('difficulty')||''));
        if (req.method === 'GET' && url.pathname.endsWith('/state')) return send(res, rooms.snapshot(token, Number(url.searchParams.get('after') || 0)));
        if (req.method !== 'POST') return send(res, { error: '지원하지 않는 요청입니다.' }, 405);
        if (!String(req.headers['content-type']).startsWith('application/json')) return send(res, { error: 'JSON 요청만 허용합니다.' }, 415);
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 8192) throw Object.assign(new Error('요청이 너무 큽니다.'), { status: 413 }); }
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { return send(res, { error: 'JSON 요청을 확인하세요.' }, 400); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, { error: '요청 형식을 확인하세요.' }, 400);
        if (url.pathname.endsWith('/create')) return send(res, rooms.create(body), 201);
        if (url.pathname.endsWith('/join')) return send(res, rooms.join(body), 201);
        if (url.pathname.endsWith('/command')) return send(res, rooms.command(token, body));
        if (url.pathname.endsWith('/leave')) return send(res, rooms.leave(token));
        return send(res, { error: '요청 경로를 찾을 수 없습니다.' }, 404);
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, { error: '지원하지 않는 요청입니다.' }, 405);
      if (url.pathname === '/') { res.writeHead(302, { location: '/preview/coop-defense-v1/' }); return res.end(); }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (!(relative.startsWith('preview/coop-defense-v1/') || relative.startsWith('assets/') || relative.startsWith('fonts/')) || relative.includes('\\') || relative.split('/').some(p => p.startsWith('.')))
        return send(res, { error: '파일을 찾을 수 없습니다.' }, 404);
      let file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) return send(res, { error: '파일을 찾을 수 없습니다.' }, 404);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file) || !fs.realpathSync(file).startsWith(root + path.sep)) return send(res, { error: '파일을 찾을 수 없습니다.' }, 404);
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' });
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch (err) { if (!res.headersSent) send(res, { error: err.message, code: err.code || 'REQUEST_FAILED' }, err.status || 400); else res.destroy(); }
  });
  const timer = setInterval(() => rooms.tick(), 100); timer.unref();
  server.on('close', () => clearInterval(timer));
  server.requestTimeout = 15000;
  return { server, rooms };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.COOP_DEFENSE_PORT || 8898), host = process.env.COOP_DEFENSE_HOST || '127.0.0.1';
  const { server } = createReviewServer();
  server.listen(port, host, () => console.log(`Cooperative defense review: http://${host}:${port}/preview/coop-defense-v1/`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
}
