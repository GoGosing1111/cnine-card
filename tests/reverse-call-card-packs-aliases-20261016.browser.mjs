import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/qa/reverse-call-card-packs-20261016');
const manifest=JSON.parse(await fs.readFile(path.join(root,'assets/ui/packs/reverse-call-20261016/manifest.json'),'utf8'));
const aliases=JSON.parse(await fs.readFile(path.join(root,'assets/ui/packs/reverse-call-20261016/legacy-aliases.json'),'utf8'));
const mime={'.js':'text/javascript','.png':'image/png','.webp':'image/webp','.avif':'image/avif'};
const sources=['/assets/cards/magiccard.png?v=1217-soop-rebuild','/assets/ui/packs/premium-cube.png?v=1218-soop-cube-premium',...Object.keys(aliases.legacyOptimized).filter(s=>/015cb27f5ba74a92153d93f4|0b92178efb66aaeafb681977/.test(s))];
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/qa'){return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<html lang="ko"><head><script defer src="/js/image-delivery-map-20261015.js"></script><script defer src="/js/image-delivery-v1.js"></script></head><body style="background:#101521;color:white;display:flex;flex-wrap:wrap;gap:12px">'+sources.map(src=>'<img width="160" height="220" style="object-fit:contain" src="'+src+'">').join('')+'</body></html>');}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
 const aliasChecks=[];
 for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:844},serviceWorkers:'block'});page.on('pageerror',e=>console.log('pageerror '+e.message));page.on('response',r=>{if(r.status()>=400)console.log('failed '+r.url())});await page.goto(base+'/qa');await page.waitForFunction(()=>[...document.images].every(i=>i.src.includes('/reverse-call-20261016/')&&i.complete&&i.naturalWidth>0));const images=await page.locator('img').evaluateAll(imgs=>imgs.map(i=>i.currentSrc));assert.equal(images.length,4);await page.screenshot({path:path.join(out,'legacy-aliases-'+width+'.png')});aliasChecks.push({width,images});await page.close();}
 const page=await browser.newPage({viewport:{width:1560,height:1240},serviceWorkers:'block'});await page.goto(base+'/qa');
 await page.setContent('<html lang="ko"><head><style>body{background:#0b101d;color:#e7e9f5;font:14px Arial;margin:30px}h1{font-size:26px}.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:20px}figure{margin:0}img{width:100%;height:380px;object-fit:contain}figcaption{text-align:center;padding:10px}</style></head><body><h1>리버스콜 · 카드팩 13종 · 확정 큐브</h1><div class="grid">'+manifest.assets.map(a=>`<figure><img src="${base}/${a.outputs.find(o=>o.path.endsWith('-768.webp')).path}"><figcaption>${a.id}</figcaption></figure>`).join('')+'</div></body></html>');
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:path.join(out,'all-packs.png'),fullPage:true});
 const record=JSON.parse(await fs.readFile(path.join(out,'browser.json'),'utf8'));record.aliasChecks=aliasChecks;record.supplementCheckedAt=new Date().toISOString();record.galleryAssets=manifest.assets.length;await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({aliasChecks:2,gallery:manifest.assets.length}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
