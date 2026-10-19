import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';
import {passFixture} from './helpers/supporter-pass-fixture.mjs';
import {handleIconCardChoice} from '../functions/_icon_card_choice.js';
import {ICON_CHOICE_ITEM as ITEM} from '../shared/icon-card-choice-v1.mjs';
const root=process.cwd(),out=resolve('docs/qa/icon-card-choice-20261020');mkdirSync(out,{recursive:true});
const app=readFileSync('js/app.js','utf8'),entry=app.slice(app.indexOf('async function openInventoryPack('),app.indexOf("  if(itemCode==='PET_SEAL_ORB')"))+'}';
const recovery=app.slice(app.indexOf('function inventoryPendingGifts(){'),app.indexOf('const INVENTORY_GROUPS=')),icon=app.slice(app.indexOf('function inventoryIcon('),app.indexOf('function inventoryItemGroup('));
let f,pass,dropResponse=false,posts=0;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host),base=url.origin;
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 if(url.pathname==='/qa')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/inventory-v2125.css"><body style="background:#080c17;color:white;font-family:sans-serif"><button id="openItem">아이콘 카드 선택권 사용</button><section id="inventoryGiftRecovery" class="iv25-gift-recovery" hidden></section><dialog id="inventoryDetailDialog" class="iv25-dialog"><div class="iv25-dialog-head"><b>아이템 상세</b><button data-inventory-close onclick="this.closest('dialog').close()" aria-label="닫기">×</button></div><div id="inventoryDialogContent"></div></dialog><script>
 const API_TOKEN='local-account-7';const loadUser=()=>({serverUserId:7});const clearApiCache=()=>{};const loadInventory=async()=>{window.refreshed=(window.refreshed||0)+1;inventoryRenderGiftRecovery();};const renderShell=()=>{};
 ${entry}\n${recovery}\n${icon}
 document.getElementById('openItem').onclick=()=>openInventoryPack('ICON_CARD_CHOICE_TICKET',1);
 document.getElementById('inventoryGiftRecovery').onclick=event=>{if(event.target.closest('[data-inventory-recover]'))openInventoryPack('ICON_CARD_CHOICE_TICKET',0);};
 </script></body></html>`);
 if(url.pathname==='/cms')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/supporter-season-pass-v1.css"><body style="background:#080c17;color:white;font-family:sans-serif"><main id="cms"></main><script type="module">import {mountPassAdmin} from '/admin/supporter-season-pass-admin-v1.mjs';const request=async(path,options={})=>{const r=await fetch('/api/'+path,{...options,headers:{'content-type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})}),body=await r.json();if(!r.ok)throw Error(body.error);return body;};mountPassAdmin(document.querySelector('#cms'),{request});</script></body></html>`);
 if(url.pathname.startsWith('/api/')){
  let body='';for await(const chunk of req)body+=chunk;
  if(url.pathname.startsWith('/api/admin/server-support/')){const result=await pass.call(url.pathname.slice(5),{method:req.method,body:body?JSON.parse(body):undefined});return res.writeHead(result.status,{'content-type':'application/json'}).end(JSON.stringify(result.body));}
  const request=new Request(base+url.pathname+url.search,{method:req.method,headers:{...req.headers,origin:base},...(body?{body}:{})});
  const response=await handleIconCardChoice({path:url.pathname.slice(5),request,env:f.env,deps:f.deps});
  if(url.pathname.endsWith('/use')){posts++;if(dropResponse&&response.status===200){dropResponse=false;return res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:'검수: 지급 후 응답 유실',retryable:true}));}}
  return res.writeHead(response.status,{'content-type':'application/json'}).end(await response.text());
 }
 const file=resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+'\\')&&!file.startsWith(root+'/'))return res.writeHead(403).end();
 const bytes=readFileSync(file);res.writeHead(200,{'content-type':({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'}).end(bytes);
}catch(error){res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({error:error.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
try{
 for(const [width,height] of [[1440,1000],[390,844],[320,740]]){
  f=await iconFusionFixture(null);await f.p('INSERT INTO inventory_items(code,name,rarity,image_url,is_active) VALUES(?,?,?,?,1)',ITEM.code,ITEM.name,ITEM.rarity,ITEM.image).run();await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,1,1)',ITEM.code).run();
  const page=await browser.newPage({viewport:{width,height},isMobile:width<700,hasTouch:width<700}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/qa');await page.locator('#openItem').click();await page.locator('[data-choice]').last().waitFor();assert.equal(await page.locator('[data-choice]').count(),8);assert.equal(await page.locator('[data-choice-confirm]').isDisabled(),true);
  assert(await page.locator('.ic-choice-heading').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.iv25-dialog-head').getBoundingClientRect().bottom));
  await page.locator('[data-choice="ICON-OH-JOEUN"]').click();assert.equal(await page.locator('[data-choice="ICON-OH-JOEUN"]').getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>[...document.querySelectorAll('.ic-choice-content img')].filter(i=>i.getBoundingClientRect().bottom>0&&i.getBoundingClientRect().top<innerHeight).every(i=>i.complete&&i.naturalWidth>0));
  const layout=await page.locator('.ic-choice-dialog').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,width:el.getBoundingClientRect().width,frame:getComputedStyle(el).borderImageSource}));assert.equal(layout.overflow,false);assert(layout.width<=width);assert.match(layout.frame,/panel.webp/);
  await page.locator('.ic-choice-content img').evaluateAll(images=>Promise.all(images.map(i=>i.decode().catch(()=>{}))));
  await page.screenshot({path:join(out,'choice-'+width+'.png')});
  // Closing a selection is free. Reopening starts unselected.
  await page.keyboard.press('Escape');await page.locator('#openItem').click();await page.locator('[data-choice]').last().waitFor();assert.equal(await page.locator('[data-choice-confirm]').isDisabled(),true);assert.equal(Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',ITEM.code).first()).quantity),1);
  await page.locator('[data-choice="ICON-OH-JOEUN"]').focus();await page.keyboard.press('Space');dropResponse=true;const before=posts;await page.locator('[data-choice-confirm]').click();await page.locator('output').filter({hasText:'응답 유실'}).waitFor();assert.equal(posts,before+1);
  await page.keyboard.press('Escape');await page.locator('[data-inventory-recover="ICON_CARD_CHOICE_TICKET"]').click();await page.locator('[data-choice-done]').waitFor();assert.equal(posts,before+1);assert.equal(Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',ITEM.code).first()).quantity),0);
  assert.equal(Number((await f.p("SELECT quantity FROM user_cards WHERE user_id=7 AND card_id='CN-1C000004'").first()).quantity),1);assert.equal(await page.evaluate(()=>window.refreshed),1);
  await page.screenshot({path:join(out,'result-'+width+'.png')});await page.locator('[data-choice-done]').click();assert.equal(await page.locator('dialog').evaluate(el=>el.open),false);assert.deepEqual(errors,[]);checks.push({viewportWidth:width,viewportHeight:height,...layout,recoveryWithoutSecondPost:true,errors});await page.close();await f.close();f=null;
 }
 pass=await passFixture();await pass.run('INSERT INTO inventory_items VALUES(?,?,?,?,1)',ITEM.code,ITEM.name,ITEM.rarity,ITEM.image);
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(base+'/cms');await page.locator('[data-pass-search]').fill('아이콘 카드 선택권');await page.locator('[data-pass-item]').selectOption('INVENTORY_ITEM:'+ITEM.code);await page.locator('[data-pass-add]').click();await page.locator('.sp-admin-reward img').waitFor();await page.locator('[data-pass-save]').click();await page.waitForFunction(()=>document.querySelector('[data-pass-admin-status]').textContent.includes('저장'));
 const saved=(await pass.call('admin/server-support/pass')).body.config;assert.equal(saved.days[0].rewards[0].ref,ITEM.code);assert.equal(saved.enabled,false);await page.screenshot({path:join(out,'cms.png')});await page.close();
 writeFileSync(join(out,'browser.json'),JSON.stringify({checks,cmsSavedTicket:true,cmsRemainsOff:true},null,2));console.log(JSON.stringify({checks,cmsSavedTicket:true},null,2));
}finally{await browser.close();await f?.close();await pass?.close();await new Promise(r=>server.close(r));}
