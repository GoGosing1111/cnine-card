import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads,fixture} from './helpers/cooperative-fixture.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await cooperativeMiniflare(),out=path.join(h.temp,'screenshots');await fs.mkdir(out,{recursive:true});
console.log('UI evidence:',out);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const clients=[],errors=[],squads=coopSquads(),socketStates=new Map(),bossAssets=new Set();
const open=async(id,width,height)=>{
 const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
 const cards=fixture.cardsByLevel[13];
 await context.addInitScript(({id,cards})=>{localStorage.setItem('cnine_card_api_token','local-qa-'+id);localStorage.setItem('cnine_card_user_v10',JSON.stringify({id,serverUserId:id,nickname:'검수 '+id,role:id===1?'OWNER':'USER',coin:12345678,cardShards:2000,masterStars:1000,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:Object.fromEntries(cards.map(c=>[c.id,13])),history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true}));localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},{id,cards});
 if(id===3)await context.addInitScript(()=>{const send=WebSocket.prototype.send;WebSocket.prototype.send=function(data){if(!window.__coopDroppedLoadAck&&typeof data==='string'&&JSON.parse(data).type==='loaded'){window.__coopDroppedLoadAck=true;return;}return send.call(this,data);};});
 await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push({id,message:e.message}));page.on('dialog',d=>d.accept());clients.push({id,page,context});
 page.on('response',r=>{if(r.url().includes('arke-battle-sprite-v1.png')&&r.status()===200)bossAssets.add(id);});
 page.on('websocket',socket=>socket.on('framereceived',event=>{try{const v=JSON.parse(event.payload);if(v.state)socketStates.set(id,v);}catch{}}));
 await page.goto(h.origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
 await page.locator('#pveCoopTab').waitFor({state:'visible'});await page.locator('#pveCoopTab').click();
 await page.locator('[data-create]').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[data-release]')?.textContent!=='연결 중');
 return page;
};
try{
 let code='',starts=[];
 if(process.env.COOP_QA_NORMAL_ONLY!=='1'){
 const a=await open(1,1440,1000);await a.screenshot({path:path.join(out,'01-entry-desktop.png'),fullPage:true});
 await a.locator('[data-create]').click();await a.locator('[data-room-title]').waitFor({state:'visible'});
 code=(await h.request(1,'current')).state.id;
 const b=await open(2,1440,1000),c=await open(3,390,844);
 for(const page of [b,c]){await page.locator('[data-refresh-rooms]').click();await page.locator(`[data-join-room="${code}"]`).click();await page.locator('[data-room]').waitFor({state:'visible'});}
 for(const {id,page} of clients){
  const squad=squads[id-1];await page.locator(`[data-choice="${squad.mercenary.code}"]`).click();await page.waitForFunction(()=>!document.querySelector('.coop-root').classList.contains('is-busy'));
  await page.locator('[data-picker="card"]').click();
  for(const card of squad.cards){await page.locator(`[data-choice="${card.id}"]`).click();await page.waitForFunction(()=>!document.querySelector('.coop-root').classList.contains('is-busy'));}
  assert.equal(await page.locator('[data-card-count]').textContent(),'2/2');assert.equal(await page.locator('[data-merc-count]').textContent(),'1/1');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'Lobby horizontal overflow');
 }
 await a.locator('[data-squads]').scrollIntoViewIfNeeded();await a.screenshot({path:path.join(out,'02-room-desktop.png'),fullPage:true});
 await c.locator('[data-squads]').scrollIntoViewIfNeeded();await c.screenshot({path:path.join(out,'03-room-mobile.png'),fullPage:true});
 await c.locator('[data-guide]').click();assert.match(await c.locator('[data-guide-content]').textContent(),/9캐릭터/);await c.screenshot({path:path.join(out,'04-guide-mobile.png')});await c.locator('[data-close-guide]').click();
 for(const {page} of clients)await page.locator('[data-ready]').click();
 for(const {page} of clients){await page.locator('.coop-battle-portal canvas').waitFor({state:'visible',timeout:60000});await page.waitForFunction(()=>document.querySelector('.coop-battle-notice')?.hidden,{},{timeout:60000});}
 await a.waitForFunction(()=>document.querySelector('[data-phase]')?.textContent?.includes('1 / 3 단계'));
 assert.equal(await c.evaluate(()=>window.__coopDroppedLoadAck),true,'A lost load acknowledgement must recover without refresh');
 await new Promise(r=>setTimeout(r,4000));
 for(const {id,page} of clients){
  const info=await page.evaluate(()=>({portal:(()=>{const r=document.querySelector('.coop-battle-portal').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})(),viewport:{w:innerWidth,h:innerHeight},diagnostics:window.ProjectVPixiBattle.diagnostics(),roster:document.querySelectorAll('[data-v3-roster-list]>li').length,exitClickable:(()=>{const b=document.querySelector('[data-exit]'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()}));
  starts.push({id,...info});assert.equal(info.portal.x,0);assert.equal(info.portal.y,0);assert.equal(info.portal.w,info.viewport.w);assert.equal(info.portal.h,info.viewport.h);
  assert.equal(info.exitClickable,true,'Exit/HUD must remain above the common modal');assert.equal(info.roster,6);assert.equal(info.diagnostics.characterStates.filter(c=>c.team==='ALLY'&&c.id.includes('OWNER:')).length,9);assert.ok(bossAssets.has(id),'Dedicated Arke sprite must preload');
  await page.screenshot({path:path.join(out,id===3?'06-battle-mobile.png':'05-battle-desktop-'+id+'.png')});
 }
 assert.equal(new Set([...socketStates.values()].map(v=>v.state.startsAt)).size,1);
 // The real shared server advances all three clients through the same waves.
 await a.waitForFunction(()=>document.querySelector('[data-phase]')?.textContent.includes('2 / 3 단계'),{},{timeout:60000});
 await a.screenshot({path:path.join(out,'08-miniboss-desktop.png')});
 await c.screenshot({path:path.join(out,'09-miniboss-mobile.png')});
 await a.waitForFunction(()=>document.querySelector('[data-phase]')?.textContent.includes('3 / 3 단계'),{},{timeout:90000});
 for(const {page}of clients)await page.waitForFunction(()=>window.ProjectVPixiBattle.diagnostics().characterStates.some(c=>c.id==='B:1:COOP:ARKE'),{},{timeout:10000});
 await a.locator('[data-pattern-action]').waitFor({state:'visible',timeout:30000});
 await a.screenshot({path:path.join(out,'10-arke-pattern-desktop.png')});
 await c.screenshot({path:path.join(out,'11-arke-pattern-mobile.png')});
 for(const {page}of clients)await page.locator('[data-pattern-action]').click();
 for(const {page}of clients)await page.waitForFunction(()=>document.querySelectorAll('[data-pattern-members] .done').length===3);
 await a.waitForFunction(()=>document.querySelector('[data-pattern-time]')?.textContent==='성공',{},{timeout:15000});
 assert.ok([...socketStates.values()].every(v=>v.state.stage.wave===3));
 assert.ok([...socketStates.values()].every(v=>v.state.patternHistory?.some(p=>p.status==='SUCCESS')));
 await a.screenshot({path:path.join(out,'12-arke-rupture.png')});
 // Browser reload must not resume the battle, while both other sockets continue.
 await b.reload();await b.waitForFunction(()=>typeof renderShell==='function');await b.evaluate(()=>renderShell('battle'));await b.locator('#pveCoopTab').click();
 await b.locator('.coop-result').waitFor({state:'visible',timeout:30000});assert.match(await b.locator('.coop-result').textContent(),/실패/);
 await a.waitForFunction(()=>document.querySelector('[data-battle-members]')?.textContent.includes('지원 분대 · 이탈'));
 assert.equal(await a.locator('.coop-result').isVisible(),false);assert.equal(await c.locator('.coop-result').isVisible(),false);
 await a.screenshot({path:path.join(out,'07-after-refresh.png')});
 await b.locator('[data-return]').click();await b.locator('[data-entry]').waitFor({state:'visible'});
 assert.equal((await h.request(2,'current')).state,null);
 await a.locator('[data-exit]').click();await a.locator('[data-entry]').waitFor({state:'visible'});assert.equal(await a.locator('.coop-battle-portal').count(),0);
 // OWNER must be able to recover OFF from the same settings UI.
 await a.locator('[data-settings]').click();const form=a.locator('[data-settings-form]');await form.locator('[name="mode"]').selectOption('OFF');await form.locator('button').click();
 await a.waitForFunction(()=>document.querySelector('[data-release]')?.textContent==='운영 중지');assert.equal(await a.locator('[data-entry]').isVisible(),false);
 await form.locator('[name="mode"]').selectOption('TEST');await form.locator('button').click();await a.waitForFunction(()=>document.querySelector('[data-release]')?.textContent==='테스트 운영 · 보상 없음');
 await a.locator('[data-close-settings]').click();await a.locator('[data-entry]').waitFor({state:'visible'});
 }
 // The same shipped V3 bundle must retain the ordinary 5-card PVE/PVP shape.
 const a=clients.find(c=>c.id===1)?.page||await open(1,1440,1000),c=clients.find(c=>c.id===3)?.page||await open(3,390,844);
 const cards=[...squads[0].cards,...squads[1].cards,squads[2].cards[1]],mercenary=squads[0].mercenary,monster={id:1,name:'검수 슬라임',image:'assets/cards/monster/sla2.jfif',battle_power:1000};
 const normal=[];
 for(const [page,mode] of [[a,'PVE'],[c,'PVP']]){
  const battleV2=mode==='PVE'?createPveBattleV2({cards,mercenary,monster,seed:10}):createPvpBattleV2({attackerCards:cards,attackerMercenary:mercenary,defenderCards:cards.map(c=>({...c,power:1000})),seed:10});
  await page.goto(h.origin+'/pve-v3/battle.html?content=idle-dungeon');await page.waitForFunction(()=>window.PveV3BattleBridge);
  await page.evaluate(payload=>window.PveV3BattleBridge.prepare(payload),{battleV2,cards,monster,mode,battlefieldMode:mode,playerName:'일반 전투 검수',opponentName:'검수 상대'});
  const before=await page.evaluate(()=>PveV3BattleBridge.diagnostics());assert.equal(before.cards,mode==='PVE'?5:10);assert.equal(before.engine.characterStates.filter(c=>c.team==='ALLY').length,6);
  await page.screenshot({path:path.join(out,'08-normal-'+mode+'.png')});
  assert.equal(await page.evaluate(async()=>{PveV3BattleBridge.setSpeed(2);return await PveV3BattleBridge.play();}),true);
  normal.push({mode,rosterCards:before.cards,allyActors:6,playbackComplete:true});
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({origin:h.origin,roomId:code,errors,clients:starts,normal,checks:code?['real shell','owned selection 2+1','3 ready/load barriers','PC/mobile fullscreen','shared 9 actors','refresh defeat; others continue','result return clears room','OWNER OFF/TEST recovery','ordinary 5-card PVE/PVP playback']:['ordinary 5-card PVE/PVP playback']},null,2));
 assert.deepEqual(errors,[]);console.log('PASS:',code?'lobby, guide, full-screen V3, refresh/return/settings and PVE/PVP.':'ordinary 5-card PVE/PVP.');
}catch(e){for(const {id,page}of clients)await page.screenshot({path:path.join(out,'failure-'+id+'.png')}).catch(()=>{});console.error('Browser errors:',errors);throw e;}
finally{await browser.close();await h.dispose();}
