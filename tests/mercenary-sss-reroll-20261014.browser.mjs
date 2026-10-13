import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {SSS_REROLL,emptySssRerollPolicy} from '../shared/mercenary-sss-reroll-v1.mjs';
import {ensureSssRerollCatalog,sssRerollState,saveSssRerollPolicy,handleSssReroll} from '../functions/_mercenary_sss_reroll.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.SSS_REROLL_QA_DIR||path.join(root,'docs/qa/sss-reroll-20261014');fs.mkdirSync(out,{recursive:true});
async function fixture(t,viewport){
 const f=await mercenaryFixture(t);await ensureSssRerollCatalog(f.env);const s=await sssRerollState(f.env,f.user),cards=s.catalog.filter(c=>c.rank==='SSS'&&c.available);
 for(const [i,c] of cards.entries())await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',c.code,i===0?2:1,i===0?1:0).run();
 await f.p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(7,?,1,CURRENT_TIMESTAMP)',cards.at(-1).code).run();
 await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,3,3)',SSS_REROLL.code).run();
 const policy={...emptySssRerollPolicy(),mode:'ON',cards:Object.fromEntries(cards.map(c=>[c.code,1e8/cards.length]))};
 await saveSssRerollPolicy(f.env,f.user,{requestId:crypto.randomUUID(),revision:0,policy});
 const traffic={posts:0,dropped:false};let base;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,base);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
   const response=await handleSssReroll({path:url.pathname.slice(5),request,env:f.env,deps:f.deps});
   if(url.pathname.endsWith('/execute')&&req.method==='POST'){traffic.posts++;if(response.status===200&&!traffic.dropped){traffic.dropped=true;res.writeHead(200,{'content-type':'application/json'});res.end('{"requestId":');return;}}
   res.writeHead(response?.status||404,{'content-type':'application/json','cache-control':'no-store'});res.end(response?await response.text():'{}');return;
  }
  const relative=decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''),file=path.resolve(root,'.'+relative);
  if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':type});fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});t.after(()=>browser.close());
 const page=await browser.newPage({viewport,hasTouch:viewport.width<500,serviceWorkers:'block'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_admin_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
 page.setDefaultTimeout(15000);return{...f,page,browser,base,errors,traffic,cards};
}
async function slide(page,mobile,fraction){
 const box=await page.locator('#seal-slider').boundingBox(),x=box.x+27,y=box.y+box.height/2,end=x+(box.width-54)*fraction;
 if(mobile){const c=await page.context().newCDPSession(page);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=10;i++)await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end-x)*i/10,y}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();}
 else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(end,y,{steps:15});await page.mouse.up();}
}
for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]])test(name+': real transaction, reload recovery, gesture, receipt replay and independent CMS',async t=>{
 const f=await fixture(t,viewport),{page,base,traffic}=f,mobile=name==='mobile';
 await page.goto(base+'/mercenary-codex/sss-reroll/');await page.locator('body[data-ready=true]').waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('.roster-card:disabled').count(),1);assert.equal(await page.locator('#begin').isEnabled(),true);await page.screenshot({path:path.join(out,name+'-room.png'),fullPage:true});
 await page.locator('#begin').click();assert.match(await page.locator('#confirm-source').innerText(),/2장 → 1장/);await page.locator('#confirm-begin').click();
 await page.waitForFunction(()=>!document.getElementById('begin').disabled);assert.equal(await page.locator('#ceremony').isVisible(),false,'uncertain response must not reveal a fabricated result');
 assert.match(await page.locator('#status').innerText(),/연결이 지연|서버 응답이/);
 assert.equal(traffic.posts,1);assert.equal(Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',SSS_REROLL.code).first()).quantity),2);
 await page.reload();await page.locator('#ceremony[data-phase=sealed]').waitFor();await page.screenshot({path:path.join(out,name+'-seal.png')});
 await slide(page,mobile,.3);assert.equal(await page.locator('#seal-slider').inputValue(),'0');assert.equal(await page.locator('#ceremony').getAttribute('data-phase'),'sealed');
 await slide(page,mobile,1);await page.locator('#ceremony[data-phase=result]').waitFor();await page.screenshot({path:path.join(out,name+'-result.png')});
 const rect=await page.locator('#done').boundingBox();assert.ok(rect.y>=0&&rect.y+rect.height<=viewport.height,'result action fits viewport');assert.equal(traffic.posts,1);assert.ok((await page.locator('#result-name').innerText()).length);
 await page.locator('#done').click();await page.locator('#ceremony').waitFor({state:'hidden'});await page.locator('#previous').waitFor();await page.locator('#previous').click();await page.locator('#skip').click();await page.locator('#ceremony[data-phase=result]').waitFor();assert.equal(traffic.posts,1);await page.locator('#done').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const drawBefore=await f.p('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first();
 await page.goto(base+'/admin/sss-reroll.html');await page.locator('#policy-form').waitFor();await page.evaluate(()=>document.fonts.ready);
 const input=page.locator('#card-inputs input').first();await input.fill('19');assert.equal(await page.locator('#save').isEnabled(),false);await input.fill('20');assert.equal(await page.locator('#save').isEnabled(),true);
 assert.match(await page.locator('#actual-odds').innerText(),/25%/);await page.screenshot({path:path.join(out,name+'-cms.png'),fullPage:true});
 await page.locator('#mode').selectOption('OFF');await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('admin-status').textContent.includes('저장 완료'));
 assert.equal((await f.p('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first()).payload_json,drawBefore.payload_json);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(f.errors,[]);
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'/mercenary-codex/sss-reroll/?preview=1');await page.locator('body[data-ready=true]').waitFor();await page.locator('#begin').click();await page.locator('#confirm-begin').click();await page.locator('#ceremony[data-phase=sealed]').waitFor();await page.locator('#seal-slider').press('End');await page.locator('#ceremony[data-phase=result]').waitFor();assert.equal(traffic.posts,1);
 fs.writeFileSync(path.join(out,name+'-review.json'),JSON.stringify({viewport,transactions:traffic.posts,reloadRecovery:true,partialSlideReset:true,mouseOrTouch:true,receiptReplay:true,reducedMotionKeyboard:true,cmsIndependent:true,errors:f.errors},null,2));
});
