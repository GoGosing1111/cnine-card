import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); // The installed workspace browser runtime; no game dependency.
const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html':'text/html; charset=utf-8','.json':'application/json','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf' };
const sources = new Set();
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname === '/preview/new-user-gift-20261001/' ? pathname+'index.html' : pathname;
    const file = resolve(root, '.'+relative);
    if (!file.startsWith(resolve(root)+sep)) { res.writeHead(403); return res.end(); }
    const bytes = await readFile(file);
    if (relative.startsWith('/assets/')) sources.add(relative.slice(1));
    res.setHeader('content-type', mime[extname(file)] || 'application/octet-stream'); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({headless:true,...(process.env.GIFT_BROWSER_CHANNEL ? {channel:process.env.GIFT_BROWSER_CHANNEL} : {})});
try {
  const page = await browser.newPage({viewport:{width:1280,height:1900},deviceScaleFactor:2});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/preview/new-user-gift-20261001/`);
  await page.evaluate(()=>window.posterReady);
  const layout = await page.evaluate(()=>{
    const poster=document.querySelector('.poster').getBoundingClientRect();
    const texts=[...document.querySelectorAll('h1,h2,.count,.level,.piece-note,figcaption,.gear-meta,.eligibility,.terms')];
    return {width:poster.width,height:poster.height,copy:document.querySelector('.poster').innerText,overflow:texts.filter(e=>{const r=e.getBoundingClientRect();return r.left<poster.left||r.right>poster.right||r.bottom>poster.bottom;}).map(e=>e.innerText),broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)};
  });
  assert.deepEqual(errors,[]);assert.deepEqual(layout.overflow,[]);assert.deepEqual(layout.broken,[]);
  for(const text of ['100','슈퍼스타','+11','FUR','+13','제니스','소버린 SKS','미스틱 장비 4종','듀얼디스크','마법카드 전체','+5'])assert.ok(layout.copy.includes(text),text);
  await mkdir(resolve(root,'assets/posters'),{recursive:true});
  const output='assets/posters/new-user-gift-20261001.png';
  await page.locator('.poster').screenshot({path:resolve(root,output)});
  const inputHashes=await Promise.all([...sources].sort().map(async path=>({path,sha256:createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')})));
  const manifest={date:'2026-10-01',output,dimensions:[2400,3600],sourceHtml:'preview/new-user-gift-20261001/index.html',catalog:'preview/new-user-gift-20261001/catalog.json',method:'Existing game images and frames composed in HTML/CSS with local Korean fonts. No generated or redrawn product assets.',sha256:createHash('sha256').update(await readFile(resolve(root,output))).digest('hex'),sources:inputHashes,copy:layout.copy};
  await writeFile(resolve(root,'assets/posters/new-user-gift-20261001.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({output,dimensions:manifest.dimensions,sha256:manifest.sha256,sources:inputHashes.length,layout:'PASS'}));
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
