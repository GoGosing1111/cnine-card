import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {mercenaryFixture} from '../tests/helpers/mercenary-db.mjs';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,MERCENARY_RUNTIME_KEY,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import fixture from '../tests/fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'));
process.chdir(root);
const out=path.join(root,'preview/mercenary-limited-deployment-20261009');fs.mkdirSync(out,{recursive:true});
const cleanup=[],f=await mercenaryFixture({after:cb=>cleanup.push(cb)},{postgres:false});
await f.setting(MERCENARY_RUNTIME_KEY,{...f.policy,mode:'OFF',combat:fixture.combat});
for(const c of LIMITED_MERCENARIES)await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',c.code,'2026-10-09','2026-10-09').run();
const user={...f.user,role:'USER'},writes=[],checks=[],errors=[];
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),key=url.pathname;
 if(key.startsWith('/api/')){
  if(key==='/api/mercenary-codex')return json(res,mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:1}));
  if(key==='/api/mercenaries/v3/state')return json(res,await mercenaryAccountState(f.env,user));
  if(key==='/api/mercenaries/v3/loadout'){let data='';for await(const part of req)data+=part;const body=JSON.parse(data);writes.push(body);return json(res,await saveMercenaryLoadout(f.env,user,body));}
  return json(res,{visible:false,enabled:false,items:[],user:{id:7,nickname:'검수 계정'}});
 }
 let file=path.resolve(root,'.'+decodeURIComponent(key));if(!file.startsWith(root+path.sep))throw Error('path');
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);return res.end('not found');}
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,{error:e.message,code:e.code},e.status||500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(label+': '+e.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-test');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:7,nickname:'검수 계정'}));});
  await page.goto(base+'/mercenary-codex/?view=limited');await page.locator('.roster-row').first().waitFor();
  assert.equal(await page.locator('.roster-row').count(),8);
  for(const c of LIMITED_MERCENARIES){
   await page.locator(`[data-code="${c.code}"]`).click();await page.locator(`[data-equip="${c.code}"]`).click();
   await page.waitForFunction(name=>document.querySelector('#loadoutName').textContent===name,c.name);
   assert.equal((await loadMercenaryBattleSnapshot(f.env,user)).code,c.code);
   assert.ok(await page.locator('[data-unequip]').isEnabled());
   if(['V-996','V-998'].includes(c.code))await page.screenshot({path:path.join(out,label+'-codex-'+c.code+'.png'),fullPage:true});
  }
  await page.reload();await page.locator('[data-unequip]').waitFor();assert.equal(await page.locator('#loadoutName').textContent(),'하이희야');
  await page.locator('[data-unequip]').click();await page.waitForFunction(()=>document.querySelector('#loadoutName').textContent==='미편성');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push(label+': all eight equip, persistence and unequip');
  await page.goto(base+'/preview/mercenary-limited-ayoon-heeya-v3-20261008/');await page.waitForFunction(()=>window.LimitedDuoPreview?.fx,{timeout:60000});
  for(const code of ['V-997','V-998']){
   await page.selectOption('#character',code);await page.waitForFunction(code=>window.LimitedDuoPreview.fx?.plan.code===code,code);
   for(const mode of ['basic','skill']){
    await page.selectOption('#mode',mode);await page.waitForFunction(mode=>window.LimitedDuoPreview.fx?.plan.mode===mode,mode);
    await page.evaluate(()=>{const fx=window.LimitedDuoPreview.fx;fx.seek(fx.plan.contacts.at(-1).at);});
    await page.screenshot({path:path.join(out,label+'-v3-'+code+'-'+mode+'.png'),fullPage:true});
    const d=await page.evaluate(()=>{const f=window.LimitedDuoPreview.fx;const d=f.diagnostics();f.showEffects=false;f.render(f.time);const hidden=f.diagnostics().visibleEffects===0;f.cancel();return{d,hidden,after:f.diagnostics()};});
    assert.ok(d.d.visibleEffects>0);assert.ok(d.hidden);assert.equal(d.after.registeredTimelines,0);checks.push(label+': '+code+' '+mode+' native V3 render and cleanup');
   }
  }
  // Exercise authoritative server HIT playback, not just the authored preview timeline.
  for(const code of ['V-997','V-998']){
   const result=await page.evaluate(async code=>{
    const preview=window.LimitedDuoPreview;preview.fx.cancel();const engine=preview.engine;
    const actor=engine.mercenaries.find(a=>a.cardId===code),target=(actor.team==='ALLY'?engine.enemies:engine.allies).find(a=>!a.isMercenary);
    let damageCalls=0;const hpCalls=[],sync=engine.syncTargetHp;engine.syncTargetHp=function(t,h){const r=sync.call(this,t,h);hpCalls.push({input:h,hp:t.hp});return r;};const show=engine.showAccountBattleUnitDamage;engine.showAccountBattleUnitDamage=function(...args){damageCalls++;return show.apply(this,args);};
    const event={seq:10000,type:'MERCENARY_HIT',actorId:actor.id,targetId:target.id,skillId:'MS-'+code.slice(2),skillName:'서버 판정 확인',damage:17,targetHpAfter:83,targetMaxHp:100,targetShieldAfter:0,targetMaxShield:0};
    engine.skillChipPlayback?.remember(event);await engine.playMercenaryEvent(event);
    engine.showAccountBattleUnitDamage=show;engine.syncTargetHp=sync;return{damageCalls,hp:target.hp,hpCalls,maxHp:target.serverMaxHp,activeClock:engine.skillChipPlayback?.active,last:engine.lastMercenaryPlayback,active:!!engine.mercenaryFx};
   },code);
   assert.equal(result.damageCalls,1);assert.ok(result.hpCalls.some(c=>c.input===83&&c.hp===83),JSON.stringify(result));assert.equal(result.active,false);checks.push(label+': '+code+' server hit displayed exactly once at contact');
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({checks,writes:writes.length,errors,source:'real account loadout functions with synthetic SQLite user; native V3 renderer'},null,2));
 console.log(JSON.stringify({passed:checks.length,writes:writes.length,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const cb of cleanup)await cb();}
