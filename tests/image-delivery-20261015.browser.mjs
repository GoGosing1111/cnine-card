import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.SYNC_QA_OUTPUT;
assert(out,'Set SYNC_QA_OUTPUT outside the checkout');fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/image-delivery-20261015/manifest.json')));
const eligible=manifest.files.filter(f=>f.frames===1&&f.width<=2048&&f.height<=2048);
const art=eligible.find(f=>f.path.includes('kairon')||f.path.includes('black-uniform'))||eligible.find(f=>f.path.includes('source-art'));
const portrait=eligible.find(f=>f.path.includes('codex')&&f.path!==art.path)||eligible[2];
const atlas=manifest.files.find(f=>f.path.includes('sheet')&&f.width<=8192&&f.height<=8192);
const samples=[art,portrait,atlas],failed=eligible.find(f=>!samples.some(s=>s.destination===f.destination));
let requests=0;
const html='<!doctype html><meta name="viewport" content="width=device-width"><title>압축 화질 검수</title><script src="/js/image-delivery-map-20261015.js"></script><script defer src="/js/image-delivery-v1.js"></script><style>body{margin:20px;background:#131a22;color:#fff;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}img{max-width:100%;max-height:620px;object-fit:contain;background:repeating-conic-gradient(#223 0 25%,#334 0 50%) 0/20px 20px}figure{margin:0}</style><h1>원본 / 무손실 압축본</h1><main>'+samples.map((f,i)=>'<figure><img id="original-'+i+'" src="/'+encodeURI(f.path)+'?original=1"><figcaption>원본</figcaption></figure><figure><img id="optimized-'+i+'" src="/'+encodeURI(f.path)+'"><figcaption>압축본 · '+Math.round((1-f.optimizedBytes/f.sourceBytes)*100)+'% 절감</figcaption></figure>').join('')+'</main><img id="fallback" src="/'+encodeURI(failed.path)+'">';
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/qa-sync.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);}
 if(url.pathname.startsWith('/api/')){requests++;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({requests}));}
 if(url.pathname==='/'+failed.destination){res.writeHead(503);return res.end('temporary failure');}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end();}if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':type,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),reports=[],errors=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/qa-sync.html');await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
  assert.match(await page.locator('#fallback').getAttribute('src'),/original=1/);
  const pixels=await page.evaluate(async length=>{
   const pixels=img=>{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0);return c.getImageData(0,0,canvas.width,canvas.height).data;};
   return Array.from({length},(_,i)=>{const a=pixels(document.getElementById('original-'+i)),b=pixels(document.getElementById('optimized-'+i));let max=0,count=0,total=0,alpha=0,compositedMax=0,opaqueMax=0;for(let p=0;p<a.length;p++){const d=Math.abs(a[p]-b[p]);if(d){count++;total+=d;max=Math.max(max,d);if(p%4===3)alpha=Math.max(alpha,d);else{const opacity=a[p-p%4+3];compositedMax=Math.max(compositedMax,d*opacity/255);if(opacity===255)opaqueMax=Math.max(opaqueMax,d);}}}return {same:count===0,max,count,mean:total/a.length,alpha,compositedMax,opaqueMax,width:document.getElementById('optimized-'+i).naturalWidth,height:document.getElementById('optimized-'+i).naturalHeight};});
  },samples.length);fs.writeFileSync(path.join(out,'pixel-report.json'),JSON.stringify({samples,pixels},null,2));assert(pixels.every(p=>p.alpha===0&&p.opaqueMax===0&&p.compositedMax<2),'Opaque pixels and alpha must match; two premultiply/unpremultiply rounding steps may differ by less than two 8-bit levels');
  await page.screenshot({path:path.join(out,'media-'+viewport.width+'.png'),fullPage:true});
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/service-worker.js');await navigator.serviceWorker.ready;});await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller);
  const fetchHash=()=>page.evaluate(async file=>{const r=await fetch('/'+file.path);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.arrayBuffer()))).map(n=>n.toString(16).padStart(2,'0')).join('');return {hash,type:r.headers.get('content-type')};},art);
  assert.equal((await fetchHash()).hash,art.optimizedHash);
  const api=await page.evaluate(async()=>[await fetch('/api/probe').then(r=>r.json()),await fetch('/api/probe').then(r=>r.json())]);assert.equal(api[1].requests,api[0].requests+1);
  await context.setOffline(true);assert.equal((await fetchHash()).hash,art.optimizedHash);await context.setOffline(false);
  reports.push({viewport,pixels,fallback:true,offlineCache:true,apiUncached:true});await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'media-report.json'),JSON.stringify({reports,samples,errors},null,2));console.log(JSON.stringify({passed:true,out,checks:reports.length}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
