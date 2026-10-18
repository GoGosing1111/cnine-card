import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {handleMercenaryDrawCms} from '../functions/_mercenary_draw_cms.js';
import {SSS_REROLL_KEY,sssRerollState} from '../functions/_mercenary_sss_reroll.js';
const root=process.cwd(),cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:false}),out='docs/qa/kangyun-live-20261018';
f.draw.cardRules.cardWeights={'V-021':100,'V-046':30,'V-049':20,'V-055':10,'V-056':10};await f.setDraw(f.draw);
await f.setting(SSS_REROLL_KEY,{revision:7,policy:{format:'MERCENARY_SSS_REROLL_V1',mode:'ON',notes:'',cards:{'V-021':60e6,'V-046':20e6,'V-049':10e6,'V-055':5e6,'V-056':5e6}}});
await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)','V-021').run();
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/admin/mercenary-draw-admin-v1.css"><main id="editor"></main><script type="module">
import {createMercenaryDrawEditor} from '/admin/mercenary-draw-admin-v1.js';
const documentData=await fetch('/document').then(r=>r.json()),host=document.getElementById('editor');
const editor=createMercenaryDrawEditor({request:async(options={})=>{const r=await fetch('/api/admin/mercenaries/draw',options),data=await r.json();if(!r.ok)throw Error(data.error);return data;},onRender:render});
function render(){host.innerHTML=editor.html(documentData);editor.mount(host);}render();</script>`;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/qa.html'){res.writeHead(200,{'content-type':'text/html'});return res.end(html);}
 if(url.pathname==='/document')return json(res,f.document);
 if(url.pathname==='/api/admin/mercenaries/draw'){let body='';for await(const part of req)body+=part;const result=await handleMercenaryDrawCms({path:'admin/mercenaries/draw',request:new Request('https://qa.test/api/admin/mercenaries/draw',{method:req.method,...(body?{body}:{})}),env:f.env,deps:{requirePermission:async()=>f.user,json:(body,status=200)=>({body,status})}});return json(res,result.body,result.status);}
 if(url.pathname==='/api/mercenary-sss-reroll/state')return json(res,await sssRerollState(f.env,f.user));
 if(url.pathname.startsWith('/api/'))return json(res,{mode:'OFF',ready:true,rankCounts:{},blockers:[]});
 let file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 res.writeHead(200,{'content-type':{'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await page.goto(base+'/qa.html');const input=page.locator('[data-draw-weight="V-057"]');await input.waitFor();assert.equal(await input.inputValue(),'17');assert.match(await page.locator('[data-draw-weight-rate="V-057"]').innerText(),/등급 내 1%/);
 // Change one visible effective weight, then restore it. Other displayed weights must stay coherent.
 await input.fill('34');assert.match(await page.locator('[data-draw-weight-rate="V-057"]').innerText(),/1\.980198/);await input.fill('17');
 await page.locator('[data-draw-save]').click();await page.locator('[data-draw-message]').filter({hasText:'저장 완료'}).waitFor();await page.reload();await input.waitFor();assert.equal(await input.inputValue(),'17');assert.equal(await page.locator('[data-draw-weight="V-021"]').inputValue(),'990');assert.match(await page.locator('[data-draw-weight-rate="V-057"]').innerText(),/등급 내 1%/);checks.push('CMS effective weights edit/save/reload: 1%');await page.close();
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const p=await browser.newPage({viewport,serviceWorkers:'block'});await p.goto(base+'/mercenary-codex/sss-reroll/');await p.locator('#open-odds').click();await p.locator('#odds-list').getByText('신궁 강윤').waitFor();const row=p.locator('#odds-list').locator('div').filter({hasText:'신궁 강윤'});assert.match(await row.innerText(),/1%/);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(out,label+'-reroll-odds.png'),fullPage:true});checks.push(label+' reroll actual Kangyun odds: 1%');await p.close();
 }
 fs.writeFileSync(path.join(out,'odds-browser.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({checks}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const cb of cleanup)await cb();}
