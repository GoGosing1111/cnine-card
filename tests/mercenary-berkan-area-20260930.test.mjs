import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {gsap} from 'gsap';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {BERKAN_BALANCE,BERKAN_AREA_SKILL_ID} from '../shared/mercenary-berkan-v1.mjs';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {createSkillDraft,parseSkillDraft} from '../shared/mercenary-skills-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {playBerkanSkill} from '../preview/project-v-v3/source/battle/BerkanCombatPlayback.js';
after(()=>gsap.ticker.sleep());

function harness({mode='PVE',count=12,control}={}){
 const snapshot=candidate('V-055');snapshot.skills=snapshot.skills.filter(s=>s.id===BERKAN_AREA_SKILL_ID);
 const actor=buildMercenaryFighter(snapshot,'A',mode,buildFighter);if(control)actor[control]=true;
 const targets=Array.from({length:count},(_,i)=>({...buildFighter({id:'T'+i,power:1e8},i,'B',null,mode),id:'T'+i,hp:1e8,maxHp:1e8,shield:i===1?1e4:0}));
 const events=[],hits=[];
 const runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit(_a,t,r,options){hits.push({id:t.id,ratio:r,...options});return {damage:r*1000,dodge:t.id==='T0'};},
  damage(t,n){const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.hp-=hpDamage;t.shield-=absorbed;return {hpDamage,absorbed};},knockout(){},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 return {actor,targets,events,hits,runtime,turn(){actor.actions++;return runtime.beforeAction(actor);}};
}
test('PVE area hits all twelve distinct enemies once with one shared budget and one cost',()=>{
 const h=harness();h.turn();const event=h.events.find(e=>e.type==='MERCENARY_STARFALL');
 assert.equal(event.skillId,'MS-056');assert.equal(event.battleMode,'PVE');assert.equal(event.impacts.length,12);
 assert.equal(new Set(event.targetIds).size,12);assert.ok(event.impacts.every(i=>i.at===1.62));
 assert.ok(Math.abs(h.hits.reduce((n,h)=>n+h.ratio,0)-BERKAN_BALANCE.damageRatio)<1e-10);
 assert.equal(h.hits[0].rangedSkill,false);assert.equal(event.impacts[0].damage,0);assert.ok(event.impacts[0].dodge);
 assert.equal(event.impacts[1].damage,0);assert.ok(event.impacts[1].absorbed>0);
 assert.equal(h.runtime.state(h.actor).energy,65);assert.equal(h.runtime.state(h.actor).cooldown.get('MS-056'),6);
 h.turn();assert.equal(h.hits.length,12,'cooldown cannot repeat the cast');
});
test('PVP, control and absent targets never pay or cast the area skill; hidden supports are excluded',()=>{
 for(const cfg of [{mode:'PVP'},{control:'stunned'},{control:'silenced'},{count:0}]){
  const h=harness(cfg);h.turn();assert.equal(h.hits.length,0);assert.equal(h.runtime.state(h.actor).energy,100);assert.equal(h.runtime.state(h.actor).cooldown.size,0);
 }
 const h=harness();h.targets[0].isBattleSuit=true;h.targets[1].untargetable=true;h.targets[2].hp=0;h.turn();assert.equal(h.hits.length,9);
 const zero=harness();zero.actor.skills[0].balance.damageRatio=0;zero.turn();assert.equal(zero.hits.length,0);assert.equal(zero.actor.damageDealt,0);
});
test('canonical legion hunt produces both skills while canonical PVP retains only two-target starfall',()=>{
 const cards=tierCards(2e7),mercenary=candidate('V-055');
 const hunt=createHuntSession({snapshot:{cards,mercenary,accountNickname:'베르칸 검수'},seed:7919,limitMs:60000});
 const events=hunt.payload.battleV2.result.timeline,area=events.filter(e=>e.type==='MERCENARY_STARFALL'&&e.skillId==='MS-056');
 assert.ok(events.some(e=>e.type==='MERCENARY_STARFALL'&&e.skillId==='MS-055'));assert.ok(area.length>0);
 assert.ok(area.some(e=>e.impacts.length===12),'real hunt must preserve twelve impacts after timeline compaction');
 for(const event of area)assert.equal(event.battleMode,'PVE');
 const both=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,seed:7919});
 const only=candidate('V-055');only.skills=only.skills.filter(s=>s.id!=='MS-056');
 const old=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:only,seed:7919});
 assert.deepEqual(both.result.timeline,old.result.timeline,'area assignment has no effect on PVP RNG, cost or actions');
 assert.ok(both.result.timeline.some(e=>e.skillId==='MS-055'));assert.ok(!both.result.timeline.some(e=>e.skillId==='MS-056'));
});
test('old CMS and skill drafts expand safely without overriding explicit assignments or operator edits',()=>{
 const old=structuredClone(seed.document);old.skills=old.skills.filter(s=>s.id!=='MS-056');old.assignments.find(a=>a.code==='V-055').skillIds=['MS-055'];old.skills[0].notes='preserve';
 const upgraded=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 assert.equal(upgraded.skills.length,36);assert.deepEqual(upgraded.assignments,old.assignments);assert.equal(upgraded.skills[0].notes,'preserve');
 upgraded.assignments.find(a=>a.code==='V-055').skillIds=[];assert.deepEqual(expandMercenarySkillCatalog(upgraded,seed.document,seed.catalog),upgraded);
 const preBerkan=structuredClone(old);preBerkan.mercenaries=preBerkan.mercenaries.filter(c=>c.code!=='V-055');preBerkan.assignments=preBerkan.assignments.filter(c=>c.code!=='V-055');preBerkan.skills=preBerkan.skills.filter(s=>s.id!=='MS-055');
 assert.equal(expandMercenarySkillCatalog(preBerkan,seed.document,seed.catalog).skills.length,36);
 const draft=createSkillDraft();draft.skills=draft.skills.filter(s=>s.id!=='MS-056');assert.equal(parseSkillDraft(JSON.stringify(draft)).skills.length,36);
});
test('V3 area playback applies all twelve server receipts once at 1.62s, respects cancellation and rejects PVP',async()=>{
 for(const mode of ['PVE','cancel','PVP']){
  const actor={id:'A',name:'베르칸',root:{},hp:100,animationController:{kill(){}}},targets=Array.from({length:12},(_,i)=>({id:'T'+i,name:'T'+i,root:{},view:{x:0},fullBodySprite:{tint:0xffffff},hp:100}));
  const synced=[],damage=[],fx={destroyed:false,removeTimeline(){},cancel(){},render(){},setPlan(){},timeline:{timeScale(){}},play(){}};
  const engine={visible:true,mercenaryEpoch:1,playbackEpoch:1,berkanStates:new Map(),combatantById:id=>[actor,...targets].find(a=>a.id===id),queueBanner(){},
   syncTargetHp(t,hp){synced.push([t.id,hp]);},syncTargetShield(){},eventHpPercent:(_t,n)=>n,showAccountBattleUnitDamage(t){damage.push(t.id);},
   async timeline(build,cleanup,rate,options){const tl=gsap.timeline({paused:true});try{assert.equal(rate,1.625);build(tl);assert.equal(fx.plan.mode,'area');assert.equal(fx.plan.damageAuthority,'SERVER_ONLY');assert.equal(fx.targets.length,12);
    tl.seek(1.61,false);assert.equal(synced.length,0);if(mode==='cancel')engine.playbackEpoch++;
    tl.seek(1.62,false);tl.seek(0,false);tl.seek(1.7,false);assert.ok(Math.abs(options.releaseAt-1.74)<1e-10);return mode!=='cancel';
   }finally{tl.kill();cleanup();}}
  };engine.berkanStates.set(actor,{fx,actor,engine,busy:false,stopped:false});
  await playBerkanSkill(engine,{type:'MERCENARY_STARFALL',actorId:'A',skillId:'MS-056',skillName:'흑금 천우',battleMode:mode==='PVP'?'PVP':'PVE',impacts:targets.map((t,i)=>({targetId:t.id,targetHpAfter:70,damage:30,at:1.62,dodge:i===0}))});
  assert.equal(synced.length,mode==='PVE'?12:0);assert.equal(damage.length,mode==='PVE'?11:0);
 }
});
