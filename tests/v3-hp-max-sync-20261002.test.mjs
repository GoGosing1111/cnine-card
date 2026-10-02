import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';

const source=readFileSync('preview/project-v-v3/source/battle/BattleEngine.js','utf8');
function method(name,text=source){
 const expression=new RegExp('^  (?:async )?'+name+'\\(', 'm'),start=text.search(expression);
 assert.ok(start>=0,name+' is available');
 const rest=text.slice(start+1),next=rest.search(/^  (?:async )?[a-zA-Z]\w*\(/m);
 return text.slice(start,next<0?text.length:start+1+next).trim();
}
const helpers={hasFiniteNumber:v=>v!==null&&v!==''&&Number.isFinite(Number(v)),clamp:(v,min,max)=>Math.min(max,Math.max(min,v)),isSkillChipTimeline:()=>false,normalizeAdvancementEffectCode:v=>v,SKILL_EFFECT_KIND:{HP:'HP',DEFENSE:'DEFENSE'}};
const Harness=new Function('helpers',`
 const {hasFiniteNumber,clamp,isSkillChipTimeline,normalizeAdvancementEffectCode,SKILL_EFFECT_KIND}=helpers;
 return class {
  constructor(cards){this.cards=cards;this.visible=true;this.playbackEpoch=0;this.allies=cards;this.paceScale=1;this.attacks=[];}
  combatantById(id){return this.cards.find(c=>c.id===id)||null;}
  syncTargetHp(target,hp){target.hp=hp;}
  syncTargetShield(){} queueSupportEffect(){} queueBanner(){} updateStatus(){} deployCards(){} isAlive(){return true;}
  isAccountBattleUnitDamageEvent(){return false;}
  normalAttack(index,options){this.syncTargetHp(options.target,options.targetHp);this.attacks.push(options);}
  playTacticalSkill(index,options){this.syncTargetHp(options.target,options.targetHp);this.attacks.push(options);}
  ${method('eventHpPercent')}
  ${method('advancePace')}
  ${method('playEvents')}
 };`)(helpers);

test('actual +14/+15 opening auras use the increased maximum before the first counter',async()=>{
 for(const [base,maxHp] of [[154294,187375],[236405,287090]]){
  const target={id:'A:4:CHI',serverMaxHp:base,hp:100},h=new Harness([target]);
  const hpAfter=Math.round(maxHp*.9);
  await h.playEvents([{type:'SINGLE_HEALER_AURA',targets:[{targetId:target.id,hpAfter:maxHp,maxHp}]},{type:'COUNTER',actorId:target.id,targetId:target.id,targetHpAfter:hpAfter,targetMaxHp:maxHp,damage:maxHp-hpAfter}]);
  assert.equal(target.serverMaxHp,maxHp);
  assert.ok(Math.abs(target.hp-90)<.001,'10% real HP loss is visible as 10%, not a full bar');
 }
});

test('damage snapshots correct the maximum even without an opening healer aura',async()=>{
 const target={id:'B:0:CHI',serverMaxHp:1000,hp:100},h=new Harness([target]);
 await h.playEvents([{type:'TURN',targetId:target.id,targetHpAfter:600,targetMaxHp:1200,damage:600}]);
 assert.equal(target.hp,50);
 await h.playEvents([{type:'MAGIC_CARD',targetId:target.id,hpAfter:900,maxHp:1200,amount:300}]);
 assert.equal(target.hp,75);
});

test('missing or invalid maxima preserve legacy percentages and never corrupt an existing maximum',()=>{
 const target={id:'A:0',serverMaxHp:1200},h=new Harness([target]);
 for(const maximum of [null,undefined,'',0,-1,NaN,Infinity]){
  assert.equal(h.eventHpPercent(target,600,maximum),50);
  assert.equal(target.serverMaxHp,1200);
 }
 assert.equal(h.eventHpPercent({serverMaxHp:100},64),64);
 assert.equal(h.eventHpPercent(target,null),null);
 assert.equal(h.eventHpPercent(target,0,1200),0);
});

test('skill-chip playback retains the authoritative maximum and ignores older HP snapshots',()=>{
 const chipSource=readFileSync('preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js','utf8');
 const remember=new Function('finite',`return {${method('remember',chipSource)}}.remember;`)(helpers.hasFiniteNumber);
 const target={id:'A:4:CHI',serverMaxHp:236405},engine=new Harness([target]);
 const playback={engine,snapshots:new Map(),revision:0};
 remember.call(playback,{seq:1,type:'SINGLE_HEALER_AURA',targets:[{targetId:target.id,hpAfter:287090,maxHp:287090}]});
 remember.call(playback,{seq:3,targetId:target.id,targetHpAfter:258381,targetMaxHp:287090});
 assert.equal(playback.snapshots.get(target).hp,90);
 remember.call(playback,{seq:2,targetId:target.id,targetHpAfter:236405,targetMaxHp:236405});
 assert.equal(playback.snapshots.get(target).hp,90);
 assert.equal(target.serverMaxHp,287090);
});

const cards=Array.from({length:5},(_,i)=>({id:'card-'+i,title:'card-'+i,power:10000,type:i===0?'HP':'SPEED',power_type:i===0?'HP':'SPEED',uniqueAbility:{hpPercent:i===0?40:0,speedPercent:20,dominantType:i===0?'HP':'SPEED'}}));
test('PvP and PvE server timelines keep renderer HP in agreement with authoritative damage and healing',async()=>{
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:137});
 const pve=createPveBattleV2({cards,monster:{id:'boss',name:'boss',battle_power:65000},seed:137});
 for(const battle of [pvp,pve]){
  const team=[...battle.teams.A.cards,...battle.teams.B.cards].map(c=>({...c,serverMaxHp:c.maxHp,hp:100}));
  const h=new Harness(team);
  const events=battle.result.timeline.filter(e=>['SINGLE_HEALER_AURA','TURN','COUNTER','MAGIC_CARD','REGEN','TEAM_HEAL','EMERGENCY_HEAL','SURVIVE','INDOMITABLE'].includes(e.type));
  assert.ok(events.some(e=>e.type==='SINGLE_HEALER_AURA'));
  for(const event of events){
   await h.playEvents([event]);
   const target=h.combatantById(event.targetId),hpAfter=event.targetHpAfter??event.hpAfter,maxHp=event.targetMaxHp??event.maxHp;
   if(target&&Number.isFinite(hpAfter)&&Number.isFinite(maxHp)&&maxHp>0)assert.ok(Math.abs(target.hp-Math.min(100,Math.max(0,hpAfter/maxHp*100)))<.00001,battle.engine+' '+event.type);
  }
 }
});

test('the cache-versioned production loader selects the bundle containing this HP correction',()=>{
 const bundle=readFileSync('preview/project-v-v3/project-v-pixi-battle.bundle.js','utf8'),app=readFileSync('js/app.js','utf8'),bridge=readFileSync('js/battle-v3-live.js','utf8'),entry=readFileSync('index.html','utf8');
 const runtime=bundle.match(/runtimeVersion:\s*["']([^"']+)["']/)?.[1];
 assert.equal(runtime,'20261002-hp-sync-v1');
 assert.ok(app.includes('project-v-pixi-battle.bundle.js?coop='+runtime));
 assert.ok(app.includes('battle-v3-live.js?coop='+runtime));
 assert.ok(bridge.includes("BATTLE_RUNTIME = '"+runtime+"'"));
 assert.ok(entry.includes('coop='+runtime));
});
