import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads,fixture} from './helpers/cooperative-fixture.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {rollCoopRoster} from '../shared/cooperative-roster-v3.mjs';
import {rebalanceCoopCombat} from '../shared/cooperative-balance-20261012.mjs';
import {defaultCoopCombat} from '../shared/cooperative-settings-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await cooperativeMiniflare(),out=process.env.COOP_ROSTER_QA_OUTPUT||path.join(h.temp,'roster-v3');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),errors=[],checks=[];
try{
 for(const [width,height] of (process.env.COOP_ROSTER_MOBILE_ONLY?[[390,844]]:[[1440,1000],[390,844]])){
  const room=await h.request(1,'create',{clientId:'roster-browser-client',requestId:'roster-browser-'+width,difficulty:'NORMAL'});assert.equal(room.ok,true);
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
  await context.addInitScript(cards=>{localStorage.setItem('cnine_card_api_token','local-qa-1');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:1,serverUserId:1,nickname:'검수',role:'OWNER',coin:1000,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true}));localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},fixture.cardsByLevel[13]);
  await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(h.origin+'/');await page.waitForFunction(()=>window.CNineCoreRaidBridge);await page.evaluate(()=>renderShell('battle'));await page.locator('#pveCoopTab').click();
  await page.locator('[data-roster]').waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('[data-roster] img')].every(i=>i.complete&&i.naturalWidth));
  assert.equal(await page.locator('[data-roster] img').count(),5);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('[data-roster]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-lobby.png')});
  await page.locator('[data-guide]').click();await page.locator('[data-chapter="1"]').click();assert.match(await page.locator('[data-guide-content]').innerText(),/보스의 특성/);assert.doesNotMatch(await page.locator('[data-guide-content]').innerText(),/직접 눌|내 노심 차단/);await page.screenshot({path:path.join(out,width+'-guide.png')});await page.locator('[data-close-guide]').click();
  const bosses=width===1440?['BASTION','VESPERA','TEMPEST','ARKE']:['TEMPEST'];
  for(const boss of bosses){
   const encounter={...rollCoopRoster(17),mobs:['IRONHOUND','BLIGHTSTALKER','STORMWISP'],boss,elite:boss==='VESPERA'?'BASTION':'VESPERA'};
   const {payload}=createCooperativeBattle({squads:coopSquads(),seed:17,combat:rebalanceCoopCombat(defaultCoopCombat()),encounter});
   await page.evaluate(async p=>{
    window.coopRosterQA?.destroy();document.querySelector('[data-roster-qa]')?.remove();await CNineCoreRaidBridge.ensureFeatureResources('battleV2');
    const portal=document.createElement('section');portal.dataset.rosterQa='1';portal.className='coop-battle-portal';portal.innerHTML='<div class="coop-battle-top"><b>격전지 · 무작위 전장 검수</b></div><div class="coop-battle-mount"></div>';document.body.append(portal);
    const {mountCoopBattle}=await import('/raid/cooperative/battle.mjs');window.coopRosterQA=await mountCoopBattle(portal.querySelector('.coop-battle-mount'),p);
   },payload);
   await page.locator('[data-roster-qa] canvas').waitFor({state:'visible'});
   if(boss===bosses[0])await page.screenshot({path:path.join(out,width+'-monsters.png')});
   const events=payload.battleV2.result.timeline,spawn=events.find(e=>e.type==='ENEMY_SPAWN'&&e.wave===3);assert.ok(spawn);
   await page.evaluate(e=>ProjectVPixiBattle.playEvents([e],{timedInternal:true}),spawn);
   await page.screenshot({path:path.join(out,width+'-'+boss+'.png')});
   const attack=events.find(e=>e.actorId===spawn.targetId&&['ATTACK','TURN'].includes(e.type));
   if(attack){await page.evaluate(e=>ProjectVPixiBattle.playEvents([e],{timedInternal:true}),attack);const d=await page.evaluate(()=>ProjectVPixiBattle.diagnostics());if(boss!=='ARKE')assert.notEqual(d.cooperativePlayback?.kind,'ARKE_SLAM');}
   checks.push({width,boss,species:encounter.mobs,attack:!!attack});
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2));console.log('PASS roster UI and battle resources:',out);
}finally{await browser.close();await h.dispose();}
