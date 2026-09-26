import test from 'node:test';
import assert from 'node:assert/strict';
import {gsap} from 'gsap';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {BERKAN_BALANCE,BERKAN_CAP_SCALE,BERKAN_MECHANIC} from '../shared/mercenary-berkan-v1.mjs';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter} from '../functions/_battle_v2_preview.js';
import {candidate,measure} from '../scripts/measure-berkan-balance.mjs';
import {playBerkanSkill,playBerkanBasic} from '../preview/project-v-v3/source/battle/BerkanCombatPlayback.js';

function harness({mode='PVP',rows=['FRONT','FRONT','BACK','BACK','BACK'],dodgeId,control,veil=0,ratio=BERKAN_BALANCE.damageRatio,lethal=false}={}){
 const actor=buildMercenaryFighter(candidate('V-055'),'A',mode,buildFighter);actor.skills[0].balance.damageRatio=ratio;if(control)actor[control]=true;
 const targets=rows.map((row,i)=>({...buildFighter({id:'T'+i,power:1e8},i,'B',null,mode),id:'T'+i,row,attack:1000+i,hp:lethal?1:1e8,maxHp:1e8,shield:0}));
 const events=[],rolls=[];
 const runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit:(_a,t,r,options)=>{rolls.push({id:t.id,ratio:r,...options});return {damage:r*1000,dodge:t.id===dodgeId};},
  damage(t,n){const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {hpDamage,absorbed};},
  knockout(t){if(t.hp<=0){t.alive=false;events.push({type:'KNOCKOUT',targetId:t.id});}},emit:(type,e)=>events.push({type,...e}),clock:()=>0});
 if(veil)runtime.debuffs.set(actor.id,{veil:{percent:veil}});
 return {actor,targets,events,rolls,runtime,turn(){actor.actions++;return runtime.beforeAction(actor);}};
}
test('one cast picks two distinct highest opening threats in the rear, then fills from the front',()=>{
 for(const [rows,ids]of [[['FRONT','FRONT','BACK','BACK','BACK'],['T4','T3']],[['FRONT','FRONT','BACK'],['T2','T1']],[['FRONT','FRONT'],['T1','T0']],[['FRONT'],['T0']]])for(const mode of ['PVP','PVE']){
  const h=harness({rows,mode});h.targets.forEach(t=>t.attack=1e8-Number(t.id.slice(1)));h.turn();
  const e=h.events.find(e=>e.type==='MERCENARY_STARFALL');assert.deepEqual(e.targetIds,ids);assert.deepEqual(e.impacts.map(i=>i.targetId),ids);
  assert.ok(e.impacts.every(i=>i.at===2.08));assert.equal(h.rolls.length,ids.length);
  assert.ok(Math.abs(h.rolls.reduce((n,r)=>n+r.ratio,0)-BERKAN_BALANCE.damageRatio)<1e-10);
  assert.ok(h.rolls.every(r=>r.capScale===BERKAN_CAP_SCALE&&!r.rangedSkill));
  assert.equal(h.runtime.state(h.actor).energy,100-BERKAN_BALANCE.cost);assert.equal(h.runtime.state(h.actor).cooldown.get('MS-055'),1+BERKAN_BALANCE.cooldownTurns);
  assert.equal(h.runtime.state(h.actor).pending,null);assert.equal(h.turn(),false);
 }
});
test('dodge, shields, simultaneous knockout and suppression keep each target share bounded',()=>{
 const h=harness({dodgeId:'T4'});h.targets[3].shield=100;h.turn();const e=h.events.find(e=>e.type==='MERCENARY_STARFALL');
 assert.equal(e.impacts[0].dodge,true);assert.equal(e.impacts[0].damage,0);assert.equal(e.impacts[1].absorbed,100);
 assert.equal(e.impacts[1].damage,BERKAN_BALANCE.damageRatio*500-100);assert.equal(h.rolls.length,2);
 const dead=harness({lethal:true});dead.turn();assert.equal(dead.rolls.length,2);assert.ok(dead.events.findIndex(e=>e.type==='KNOCKOUT')>dead.events.findIndex(e=>e.type==='MERCENARY_STARFALL'));
 for(const mode of ['PVP','PVE']){
  const weakened=harness({mode,veil:25});weakened.turn();assert.ok(weakened.rolls.every(r=>Math.abs(r.ratio-BERKAN_BALANCE.damageRatio*.75/2)<1e-10));
  assert.ok(weakened.rolls.every(r=>Math.abs(r.capScale-BERKAN_CAP_SCALE*(mode==='PVP'?.75:1))<1e-10));
 }
});
test('no target or controlled actor spends nothing; zero damage never becomes a basic hit',()=>{
 for(const control of ['stunned','silenced']){const h=harness({control});h.turn();assert.equal(h.rolls.length,0);assert.equal(h.runtime.state(h.actor).energy,100);}
 const absent=harness({rows:[]});absent.turn();assert.equal(absent.runtime.state(absent.actor).energy,100);assert.equal(absent.rolls.length,0);
 for(const config of [{ratio:0},{veil:100}]){const h=harness(config);h.turn();assert.equal(h.rolls.length,0);assert.equal(h.actor.damageDealt,0);assert.ok(h.targets.every(t=>t.hp===1e8));}
 const excluded=harness();excluded.targets[4].isBattleSuit=true;excluded.targets[3].untargetable=true;excluded.turn();assert.deepEqual(excluded.rolls.map(r=>r.id),['T2','T1']);
});
test('stored single-target CMS upgrades only Berkan and preserves operator edits after upgrade',()=>{
 const before=structuredClone(seed.document),old=before.skills.find(s=>s.id==='MS-055');
 old.mechanic='LOCKED_THREAT_SHOT';old.balance={damageRatio:5.88,cooldownTurns:5,cost:35};before.assignments.find(a=>a.code==='V-055').skillIds=[];
 const copy=structuredClone(before),next=expandMercenarySkillCatalog(before,seed.document,seed.catalog);
 assert.deepEqual(before,copy);assert.deepEqual(next.skills.find(s=>s.id==='MS-055').balance,BERKAN_BALANCE);assert.equal(next.skills.find(s=>s.id==='MS-055').mechanic,BERKAN_MECHANIC);
 for(const key of ['mercenaries','assignments','settings'])assert.deepEqual(next[key],before[key]);
 assert.deepEqual(next.skills.filter(s=>s.id!=='MS-055'),before.skills.filter(s=>s.id!=='MS-055'));
 next.skills.find(s=>s.id==='MS-055').balance.cost=31;assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 old.balance.damageRatio=4;old.balance.cost=29;assert.deepEqual(expandMercenarySkillCatalog(before,seed.document,seed.catalog).skills.find(s=>s.id==='MS-055').balance,{damageRatio:4,cooldownTurns:5,cost:29});
});
test('real GSAP contact applies both authoritative results once, and old single-hit replays still work',async()=>{
 for(const mode of ['twin','legacy','cancel','basic']){
  const actor={id:'A',name:'베르칸',root:{},hp:100,animationController:{kill(){}}},targets=['T1','T2'].map(id=>({id,name:id,root:{},view:{x:0},fullBodySprite:{tint:0xffffff},hp:100}));
  const sync=[],damage=[],rendered=[],fx={destroyed:false,removeTimeline(){},cancel(){},render(t){rendered.push({t,targets:this.targets.length});},setPlan(){},timeline:{timeScale(){}},play(){}};
  const engine={visible:true,mercenaryEpoch:1,playbackEpoch:1,berkanStates:new Map(),combatantById:id=>[actor,...targets].find(a=>a.id===id),isAlive:a=>a.hp>0,
   queueBanner(){},syncTargetHp(t,hp){sync.push([t.id,hp]);},syncTargetShield(){},eventHpPercent:(_t,n)=>n,showAccountBattleUnitDamage(t,d){damage.push([t.id,d.damage]);},
   async timeline(build,cleanup,_unused,options){const tl=gsap.timeline({paused:true});try{build(tl);const at=mode==='basic'?1.12:2.08;tl.seek(at-.01,false);assert.equal(sync.length,0);
    if(mode==='cancel')engine.playbackEpoch++;tl.seek(at,false);tl.seek(0,false);tl.seek(at+.05,false);assert.ok(options.owners.includes(actor));return mode!=='cancel';
   }finally{tl.kill();cleanup();}}
  };engine.berkanStates.set(actor,{fx,actor,engine,busy:false,stopped:false});
  const event={type:'MERCENARY_STARFALL',actorId:'A',skillId:'MS-055',skillName:'흑금 낙성',impacts:targets.map((t,i)=>({targetId:t.id,targetHpAfter:70+i,damage:30-i,at:2.08,dodge:i===1}))};
  if(mode==='legacy'){delete event.impacts;Object.assign(event,{type:'MERCENARY_HIT',targetId:'T1',targetHpAfter:70,damage:30});}
  try{if(mode==='basic')await playBerkanBasic(engine,{attacker:actor,target:targets[0],damage:10,targetHp:90});else await playBerkanSkill(engine,event);
   assert.equal(sync.length,mode==='cancel'?0:mode==='twin'?2:1);assert.equal(damage.length,mode==='cancel'?0:1);
   assert.equal(rendered[0].targets,mode==='twin'||mode==='cancel'?2:1);
  }finally{gsap.ticker.sleep();}
 }
});
test('canonical battles keep Berkan near Cryvern with slightly lower boss skill output',()=>{
 const report=measure();assert.equal(report.total,8192);
 for(const group of report.groups)assert.ok(group.rate>=.45&&group.rate<=.52,JSON.stringify(group));
 for(const boss of report.pve)assert.ok(boss.ratio>.90&&boss.ratio<1,JSON.stringify(boss));
});
