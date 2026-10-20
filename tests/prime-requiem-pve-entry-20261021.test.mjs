import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {warmPrimeActor,playPrimeBasic,playPrimeArea} from '../preview/project-v-v3/source/battle/PrimeRequiemCombatPlayback.js';
import {PRIME_AREA_EVENT} from '../shared/mercenary-prime-requiem-v1.mjs';
import {SKILLS} from '../preview/prime-requiem-blood-skills-20261021-v1/source/SkillPlan.mjs';

test('a pending Prime atlas manifest cannot become a battlefield-entry barrier',t=>{
 t.mock.method(globalThis,'fetch',()=>new Promise(()=>{}));
 const actor={root:{destroyed:false}},engine={mercenaryEpoch:1};
 assert.equal(warmPrimeActor(engine,actor),undefined);
 assert.equal(engine.primeLoads.has(actor),true);
 assert.equal(engine.primeStates.size,0);
});

test('cold Prime basic uses the existing V3 attack once without waiting for images',async()=>{
 const actor={},target={},engine={isAlive:()=>true};let calls=0;
 assert.equal(await playPrimeBasic(engine,{attacker:actor,target},()=>{calls++;return 'server-strike';}),'server-strike');
 assert.equal(calls,1);
});

test('cold or failed Prime area FX still apply each unique server HP/shield receipt once',()=>{
 const actor={cardId:'V-975'},target={id:'boss',root:{destroyed:false}},calls=[];
 const engine={combatantById:id=>id==='prime'?actor:target,eventHpPercent:(_t,h,m)=>h/m*100,
  syncTargetHp:(_t,h)=>calls.push(['hp',h]),syncTargetShield:(_t,s,m)=>calls.push(['shield',s,m]),
  showAccountBattleUnitDamage:(_t,v)=>calls.push(['damage',v.damage])};
 const hit={targetId:'boss',targetHpAfter:750,targetMaxHp:1000,targetShieldAfter:0,targetMaxShield:50,damage:200,absorbed:50};
 assert.equal(playPrimeArea(engine,{actorId:'prime',type:PRIME_AREA_EVENT,battleMode:'PVE',skillId:'MS-966',hits:[hit,hit]}),true);
 assert.deepEqual(calls,[['hp',75],['shield',0,50],['damage',250]]);
});

test('the real live wrapper allows the complete approved Prime area animation',()=>{
 const source=fs.readFileSync(new URL('../js/battle-v3-live.js',import.meta.url),'utf8');
 const chunk=source.slice(source.indexOf('    const eventPlaybackTimeoutMs ='),source.indexOf('    const safePlayEvents ='));
 const timeout=vm.runInNewContext(chunk+'\neventPlaybackTimeoutMs');
 const longest=Math.max(...SKILLS.filter(s=>s.targetMode==='area').map(s=>s.duration))/2*1000;
 assert(longest>2000);assert(timeout([{type:PRIME_AREA_EVENT}])>longest+1000);
 assert.equal(timeout([{type:'TURN',actorId:'other'}]),2000);
});
