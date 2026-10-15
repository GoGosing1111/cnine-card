import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {growthCodexPreviewFixture, growthPreviewHtml} from './codex-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.GROWTH_PREVIEW_PORT || 9127);
http.createServer(async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.writeHead(405, {Allow: 'GET', 'Content-Type': 'application/json;charset=utf-8'});
      res.end(JSON.stringify({error: 'Preview is read-only'}));
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json;charset=utf-8');
      res.end(JSON.stringify(growthCodexPreviewFixture(url.pathname) ?? {visible: false}));
      return;
    }
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const extension = path.extname(file);
    res.setHeader('Content-Type', ({'.html':'text/html;charset=utf-8','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'})[extension] || 'application/octet-stream');
    const contents = await fs.readFile(file);
    res.end(extension === '.html'
      ? growthPreviewHtml(contents.toString('utf8'), path.relative(root, file).split(path.sep).join('/'))
      : contents);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log('Growth V2 review: http://127.0.0.1:' + port + '/mercenary-codex/'));
