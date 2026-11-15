import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFighter} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {snapshot} from '../scripts/measure-prime-zero-revan-cardgu-20261102.mjs';
import {ZERO_AREA_SKILLS,ZERO_AWAKENING,ZERO_PVE_BALANCE,ZERO_COMBAT,zeroCodexSkills} from '../shared/mercenary-zero-v1.mjs';
import {PRIME_PVE_BALANCE,PRIME_COMBAT} from '../shared/mercenary-prime-requiem-v1.mjs';
import {resolveAreaCutin} from '../shared/mercenary-area-cutins-v1.mjs';
import {playZeroArea} from '../preview/project-v-v3/source/battle/ZeroCombatPlayback.js';
import {awakeningStrikes} from '../preview/zero-awakening-20261115/source/ZeroAwakening.js';
const fighter=(code,level=1,gear=0,mode='PVE')=>buildMercenaryFighter(snapshot(code,level,mode,gear),'A',mode,buildFighter);

test('one boss, five targets and a full field all receive a complete twelve-strike visual flurry',()=>{
 for(const count of [1,5,12])for(const direction of [-1,1]){
  const targets=Array.from({length:count},(_,i)=>({id:'t'+i,foot:{x:i%3*100,y:Math.floor(i/3)*100},point:{x:i%3*100,y:0}}));
  const original=structuredClone(targets),strikes=awakeningStrikes(targets,180,direction);
  assert.equal(strikes.length,12);assert.equal(new Set(strikes.map(s=>s.id)).size,count);assert.equal(strikes[0].at,.48);assert(Math.abs(strikes.at(-1).at-2.14)<1e-9);assert.deepEqual(targets,original);
  if(count===1){assert.equal(new Set(strikes.map(s=>s.pose)).size,4);assert.equal(new Set(strikes.map(s=>s.facing)).size,2);}
 }
});

test('Zero/Prime base, growth, equipment and PVP stats remain equal at every sampled tier',()=>{
 for(const mode of ['PVE','PVP'])for(const level of [1,11,21])for(const gear of [0,1e8]){
  const z=fighter('V-976',level,gear,mode),p=fighter('V-975',level,gear,mode);
  for(const key of ['basePower','attack','maxHp','defense','speed','maxShield','basicCap','mercenaryLevel','equipment'])assert.deepEqual(z[key],p[key],key);
  if(mode==='PVP')assert.deepEqual(z.skills,[]);
 }
 assert.equal(ZERO_COMBAT,PRIME_COMBAT);assert.equal(ZERO_COMBAT.basePower,3000000);
 for(const key of ['damageRatio','cooldownTurns','cost'])assert.equal(ZERO_PVE_BALANCE[key],PRIME_PVE_BALANCE[key]);
 assert.equal(PRIME_PVE_BALANCE.version,3);
});

test('real actions rotate all three skills under one three-action cooldown and one energy charge',()=>{
 const a=fighter('V-976'),enemy={...buildFighter({id:'t',power:1e7},0,'B',null,'PVE'),hp:1e14,maxHp:1e14},events=[];
 const runtime=mercenaryCombat({teams:{A:[a],B:[enemy]},hit:()=>({damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit:(type,event)=>events.push({type,...event,action:a.actions}),clock:()=>a.actions});
 for(let action=1;action<=16;action++){a.actions=action;runtime.beforeAction(a);}
 const casts=events.filter(e=>e.type==='MERCENARY_ZERO_AREA');
 assert(casts.length>=4);assert.deepEqual(casts.slice(0,3).map(e=>e.skillId),ZERO_AREA_SKILLS.map(s=>s.id));
 for(let i=1;i<casts.length;i++)assert.equal(casts[i].action-casts[i-1].action,3);
 assert(casts.some(e=>e.skillId===ZERO_AWAKENING.id));
});

test('saved old Zero snapshots refresh to the approved skill, policy, and codex',()=>{
 const old=snapshot('V-976');old.skills=old.skills.slice(0,2);old.zeroPvePolicyVersion=0;
 const current=buildMercenaryFighter(old,'A','PVE',buildFighter);
 assert.deepEqual(current.skills.map(s=>s.id),ZERO_AREA_SKILLS.map(s=>s.id));
 assert.equal(ZERO_AWAKENING.playbackRate,1.75);
 assert(Math.abs((ZERO_AWAKENING.duration+ZERO_AWAKENING.hitstop)/ZERO_AWAKENING.playbackRate-2.442857142857143)<1e-9);
 const codex=zeroCodexSkills().find(s=>s.id===ZERO_AWAKENING.id);assert.match(codex.trigger,/에너지 20.*3행동/);
 const cutin=resolveAreaCutin({type:'MERCENARY_ZERO_AREA',battleMode:'PVE',skillId:ZERO_AWAKENING.id,hits:[{}]},{cardId:'V-976',isMercenary:true});
 assert(cutin.skill.line);assert.equal(cutin.skill.name,ZERO_AWAKENING.name);
});

test('optional awakening resource failure still applies each authoritative receipt exactly once',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw Error('QA offline');});
 const actor={cardId:'V-976',root:{destroyed:false}},target={id:'boss',root:{destroyed:false}},calls=[];
 const engine={playbackEpoch:1,mercenaryEpoch:1,visible:true,combatantById:id=>id==='zero'?actor:target,eventHpPercent:(_t,h,m)=>h/m*100,syncTargetHp:(_t,h)=>calls.push(['hp',h]),syncTargetShield:(_t,s)=>calls.push(['shield',s]),showAccountBattleUnitDamage:(_t,v)=>calls.push(['damage',v.damage])};
 const hit={targetId:'boss',targetHpAfter:700,targetMaxHp:1000,targetShieldAfter:0,damage:250,absorbed:50};
 assert.equal(await playZeroArea(engine,{actorId:'zero',type:'MERCENARY_ZERO_AREA',battleMode:'PVE',skillId:ZERO_AWAKENING.id,hits:[hit,hit]}),true);
 assert.deepEqual(calls,[['hp',70],['shield',0],['damage',300]]);
});

test('recorded 216 canonical simulations match Prime output and visit the new awakening',()=>{
 const report=JSON.parse(fs.readFileSync(new URL('../docs/qa/zero-awakening-release-20261115/balance.json',import.meta.url)));
 assert.equal(report.simulations,216);assert.equal(report.zeroToPrime,1);
 for(const r of report.rows){assert.equal(r.zero.damage,r.prime.damage);assert.equal(r.zero.casts,r.prime.casts);assert(r.zero.skillIds.includes(ZERO_AWAKENING.id));}
});
