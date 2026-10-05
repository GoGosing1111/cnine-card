import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
import {previewState} from '../preview/mercenary-limited-pack-20261006-v1/fixture.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=fs.readFileSync('js/app.js','utf8'),hero=source.slice(source.indexOf('function limitedMercenaryPackHero('),source.indexOf('function standardPackHero(')),root=process.cwd(),out='preview/mercenary-limited-pack-20261006-v1/qa',state=previewState();state.userOpeningEnabled=false;state.packSettings.prices={single:null,ten:null};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/shop-qa'){res.setHeader('content-type','text/html');return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/mercenary-limited-shop-v1.css"><style>body{background:#0d1018;color:#fff;margin:24px;font-family:Arial,sans-serif}main{max-width:1120px;margin:auto}@media(max-width:650px){body{margin:12px}}</style><main></main><script>'+hero+'document.querySelector("main").innerHTML=limitedMercenaryPackHero({prices:{single:null,ten:null}});</script></html>');}
 if(u.pathname==='/api/mercenary-limited-pack/config'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(state));}
 const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
 res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
try{for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/shop-qa');
 assert.equal(await page.locator('.limited-shop-prices').innerText().then(s=>s.includes('설정 전')),true);await page.screenshot({path:out+'/shop-'+name+'.png',fullPage:true});
 await page.locator('[data-limited-pack-enter]').click();await page.waitForSelector('[data-lp-canvas][data-state=ready]');assert.equal(await page.locator('[data-lp-buy="1"]').isDisabled(),true);assert.equal(await page.locator('[data-lp-access]').innerText(),'출시 준비 중 · 개봉 OFF');
 assert.ok(await page.locator('.lp-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));checks.push(name+' real shop component opens gated contract room; unset price never shows free purchase');await page.close();
}assert.deepEqual(errors,[]);fs.writeFileSync(out+'/shop-report.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}));}finally{await browser.close();await new Promise(r=>server.close(r));}
