import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createPvpBattleV2,createPveBattleV2} from '../../functions/_battle_v2_preview.js';
import {balanceSnapshot} from '../../scripts/measure-ss-mercenary-balance-20261019.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),root=new URL('../../',import.meta.url);
const available=(await Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(async p=>{const m=JSON.parse(await fs.readFile(new URL('assets/ui/project-v/characters/'+p,root)));return m.characters.map(c=>({...c,grade:m.rarity}));}))).flat();
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const cards=ids.map((id,i)=>{const c=available.find(c=>c.cardId===id);return {...c,id,name:c.member,image:'/'+c.sourceArt,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]};});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),report={errors:[],missing:[],cases:[]};
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]])for(const mode of ['PVE','PVP']){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>report.errors.push({name,mode,error:e.message}));page.on('response',r=>{if(r.status()>=400)report.missing.push({status:r.status(),url:r.url()});});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto('http://127.0.0.1:8973/preview/mercenary-bathory-halloween-20261019-v1/qa/runtime.html');
  const mercenary=balanceSnapshot('V-977');
  const b=mode==='PVP'?createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:7919}):createPveBattleV2({cards,mercenary,monster:{id:1,name:'바토리 전투 검수',battle_power:5e9},seed:7919});
  const data={mode,battlefieldMode:mode==='PVP'?'PVP':'HUNT',battleV2:b};
  const mounted=await page.evaluate(async({cards,data,mode})=>{
   window.cnineCardCatalog=()=>cards;const api=window.ProjectVPixiBattle,original=api.mountForBattle;api.mountForBattle=async(...args)=>(window.qaEngine=await original(...args));
   const modal=document.getElementById('modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode});
   window.qaRenderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data,mode});api.mountForBattle=original;
   const e=window.qaEngine;await e.deployCards({instant:true,force:true});await e.setVisible(true);
   window.qaEvents=data.battleV2.result.timeline.filter(ev=>ev.type==='MERCENARY_HIT'&&ev.actorId?.endsWith('V-977'));
   return {actors:e.mercenaries.map(a=>({id:a.id,code:a.cardId,team:a.team,bodyHeight:a.art.bodyHeight,hud:a.hud.visible})),events:window.qaEvents.length,states:e.bathoryStates.size,overflow:document.documentElement.scrollWidth>innerWidth+1};
  },{cards,data,mode});
  assert(mounted.events>0);assert.equal(mounted.states,mode==='PVP'?2:1);assert.equal(mounted.overflow,false);
  const playback=await page.evaluate(async()=>{
   const e=window.qaEngine,events=window.qaEvents,rows=[];
   for(const actor of e.mercenaries){
    const event=events.find(ev=>ev.actorId===actor.id);if(!event)continue;const target=e.combatantById(event.targetId),hp=[],sync=e.syncTargetHp,show=e.showAccountBattleUnitDamage;
    let count=0;e.syncTargetHp=function(a,v){hp.push({id:a.id,hp:v});return sync.call(this,a,v);};e.showAccountBattleUnitDamage=function(...args){count++;return show.apply(this,args);};
    const camera={x:e.stage.x,y:e.stage.y,sx:e.stage.scale.x,sy:e.stage.scale.y};target.view.x=3;target.view.y=-2;
    const recoil={x:target.view.x,y:target.view.y};
    const fx=e.bathoryStates.get(actor).fx;fx.targets=[target];fx.render(0);const recoilPreserved=target.view.x===recoil.x&&target.view.y===recoil.y;
    await e.playMercenaryEvent(event);e.syncTargetHp=sync;e.showAccountBattleUnitDamage=show;
    rows.push({side:actor.team,count,hp,expected:event.targetHpAfter/event.targetMaxHp*100,last:e.lastMercenaryPlayback,cameraPreserved:JSON.stringify(camera)===JSON.stringify({x:e.stage.x,y:e.stage.y,sx:e.stage.scale.x,sy:e.stage.scale.y}),recoilPreserved,home:Math.abs(actor.root.x-actor.baseX)<.1&&Math.abs(actor.root.y-actor.baseY)<.1,hud:actor.hud.visible});target.view.position.set(0,0);
   }
   const actor=e.mercenaries[0],target=e.enemies.find(a=>e.isAlive(a));let hits=0;
   if(target){await e.normalAttack(0,{attacker:actor,target,damage:1,targetHp:99,onImpact:()=>hits++});}
   const event=events[0],sync=e.syncTargetHp;let cancelledHits=0;e.syncTargetHp=function(...args){cancelledHits++;return sync.apply(this,args);};
   const playing=e.playMercenaryEvent(event);await new Promise(r=>setTimeout(r,120));e.cancelTimelines();await playing;e.syncTargetHp=sync;
   const cancel={hits:cancelledHits,states:[...e.bathoryStates.values()].map(s=>({busy:s.busy,stopped:s.stopped,ambient:!!s.ambient,fx:s.fx.pool.filter(p=>p.visible).length})),clocks:e.simpleTimelines.size};
   await e.setVisible(false);await e.setVisible(true);
   const resumed=[...e.bathoryStates.values()].filter(s=>s.actor.hp>0).every(s=>s.ambient&&!s.stopped);
   return {rows,basicHits:hits,cancel,resumed};
  });
  for(const r of playback.rows){assert.equal(r.count,1);assert.equal(r.last.damageApplications,1);assert(r.hp.some(h=>Math.abs(h.hp-r.expected)<1e-8));assert(r.cameraPreserved);assert(r.recoilPreserved);assert(r.home);assert(r.hud);}
  assert.equal(playback.basicHits,1);assert.equal(playback.cancel.hits,0);assert(playback.cancel.states.every(s=>!s.busy&&!s.ambient&&s.fx===0));assert(playback.resumed);
  await page.screenshot({path:new URL('qa/runtime-'+name+'-'+mode+'.png',import.meta.url).pathname.slice(1),fullPage:true});
  const cleanup=await page.evaluate(()=>{const e=window.qaEngine;window.qaRenderer.destroy();window.ProjectVPixiBattle.destroy();return {states:e.bathoryStates.size,loads:e.bathoryLoads.size};});assert.equal(cleanup.states,0);
  report.cases.push({name,mode,mounted,playback,cleanup});await page.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);
 await fs.writeFile(new URL('qa/runtime-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'PASS',cases:report.cases.length,errors:report.errors,missing:report.missing}));
}finally{await browser.close();}
