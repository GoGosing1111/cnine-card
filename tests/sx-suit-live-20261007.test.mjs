import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildFighter,buildMonsterFighter,buildBattleSuitFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {SX_SUIT_CODE,SX_ATTACK_SPEED,SX_AREA_SKILL as SKILL} from '../shared/sx-suit-v1.mjs';
import {X_BODY_AREA_SKILL} from '../shared/x-body-area-skill.mjs';
import {normalizeSkillChipCodes} from '../shared/battle-suit-skill-chips.mjs';
import {takeSxBatch,sxAreaMotionTime,sxAreaMotionEnd} from '../preview/project-v-v3/source/battle/SXSuitModel.mjs';
import {MODES} from '../preview/battle-suit-sx-v1/motion.mjs';
const read=path=>readFile(new URL('../'+path,import.meta.url));
function simulate({code=SX_SUIT_CODE,power=50000000,count=5,pvp=false,dead=false}={}){
  const a=['HP','DEFENSE','ATTACK','SPEED','DEFENSE'].map((power_type,i)=>({...buildFighter({id:String(i),power_type,power:3000000},i,'A',null,pvp?'PVP':'PVE'),hp:1e12,maxHp:1e12,attack:1,speed:200}));
  const b=Array.from({length:count},(_,i)=>({...buildMonsterFighter({id:i+1,battle_power:50000000,is_boss:1}),id:'B:'+i+':MONSTER:'+i,isMonster:!pvp,alive:!(dead&&i===count-1),hp:1e12,maxHp:1e12,shield:1e14,maxShield:1e14,attack:1,speed:200}));
  const support=buildBattleSuitFighter({code,pvePower:power});
  return simulateBattleV2Preview({teamA:[...a,...(support?[support]:[])],teamB:b,maxActions:2000,maxCombatDurationMs:41000,seed:2011});
}
const casts=r=>r.timeline.filter(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===SKILL.code);
test('only SX doubles independent attack cadence; X per-shot stats and divisor stay unchanged',()=>{
  for(const weaponCode of ['', 'EQ_1785427638137','EQ_1785961300455']){
    const input={weaponCode,pvePower:50000000},x=buildBattleSuitFighter({...input,code:'BATTLE_SUIT_X_BODY'}),sx=buildBattleSuitFighter({...input,code:SX_SUIT_CODE});
    assert.equal(SX_ATTACK_SPEED,2);assert.equal(sx.independentFireInterval,x.independentFireInterval/2);
    assert.equal(sx.independentOpeningDelay,x.independentOpeningDelay/2);
    for(const field of ['attack','power','independentShotsPerCycle','independentAttackMultiplier','consumesBattleAction','usesSpeedGauge'])assert.equal(sx[field],x[field],field);
    assert.equal(buildBattleSuitFighter({...input,code:'BATTLE_SUIT_OVERLORD'}).independentFireInterval,x.independentFireInterval);
  }
});
test('SX ground strike keeps X damage and 20s cooldown, and every server target receives exactly five impacts',()=>{
  assert.equal(SKILL.damageMultiplier,X_BODY_AREA_SKILL.damageMultiplier);assert.equal(SKILL.intervalMs,20000);
  const result=simulate(),list=casts(result);assert.deepEqual(list.map(e=>e.combatAtMs),[0,20000,40000]);
  // A sub-millisecond support shot must not move the next card gauge deadline
  // forever. Both teams still act while the suit fires at twice X's cadence.
  for(const team of ['A','B'])assert.ok(result.timeline.some(e=>e.type==='TURN'&&e.actorKind!=='BATTLE_SUIT'&&String(e.actorId).startsWith(team+':')),'card gauge starvation: '+team);
  const reference=simulate({code:'BATTLE_SUIT_X_BODY'}).timeline.find(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===X_BODY_AREA_SKILL.code);
  assert.equal(list[0].calculatedDamage,reference.calculatedDamage);
  for(const cast of list.filter(c=>c.combatAtMs<40000))for(const target of cast.targets){
    const hits=result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===cast.castId&&e.targetId===target.targetId);
    assert.equal(hits.length,5);assert.equal(hits.reduce((sum,e)=>sum+e.damage+e.absorbed,0),target.calculatedDamage);
    for(const hit of hits)assert.equal(hit.combatAtMs,cast.combatAtMs+SKILL.impactOffsetsMs[hit.hitIndex]);
  }
});
test('twelve hunt targets, dead-target exclusion, zero power and PVP gates use existing rules',()=>{
  assert.equal(casts(simulate({count:12}))[0].targetIds.length,12);
  assert.equal(casts(simulate({dead:true}))[0].targetIds.length,4);
  assert.equal(casts(simulate({pvp:true})).length,0);assert.equal(casts(simulate({power:0})).length,0);
  assert.deepEqual(normalizeSkillChipCodes([SKILL.code]),[]);
});
test('double-speed authored strikes preserve receipt order, totals and X boss-skill cooldown selection',()=>{
  const target={id:'boss',isBoss:true},other={id:'other'};
  const rows=Array.from({length:121},(_,i)=>({target:i<100?target:other,options:{damage:i+1}})),queue=[...rows],seen=[];
  let cooldown=0,now=0;
  while(queue.length){const batch=takeSxBatch(queue,{combatAtMs:now,nextSkillAtMs:cooldown});if(batch.mode==='skill')cooldown=now+10000;now+=1000;seen.push(...batch.entries);
    assert.equal(batch.duration,MODES[batch.mode].duration/2);
    for(const impact of batch.impacts)assert.ok(MODES[batch.mode].contacts.some(t=>Math.abs(t*500-impact.atMs)<1e-6));
  }
  assert.deepEqual(seen,rows);
  assert.equal(takeSxBatch([{target}],{combatAtMs:5000,nextSkillAtMs:10000}).mode,'attack');
  const contacts=SKILL.impactOffsetsMs.map(ms=>ms/1000+3);
  assert.equal(sxAreaMotionTime(contacts[0],contacts),2.02);assert.equal(sxAreaMotionEnd(contacts),8.7);
});
test('live loaders include SX while the source image and all approved choreography stay intact',async()=>{
  const manifest=JSON.parse(await read('assets/ui/project-v/account-battle-suits/sx-v1/manifest.json'));
  assert.equal(manifest.runtimeEnabled,true);assert.equal(manifest.suitCode,SX_SUIT_CODE);
  const bytes=await read('preview/battle-suit-sx-v1/assets/sources/sx-standing-approved-20261007.png');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'0ecc36640e457a5ef33f5d5d34dfaac4c548504375f732dea0d456609a5bb73b');
  for(const file of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','pve-v3/battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js']){
    const text=(await read(file)).toString();for(const token of [SX_SUIT_CODE,SKILL.code,'SX_LIVE_20261007_2X_V1','SXBlueReaperTitle','SXGroundStrikeFront'])assert.ok(text.includes(token),file+': '+token);
  }
  for(const file of ['index.html','js/app.js','pve-v3/battle.html','pve-v3/battle-loader.mjs','preview/sustained-hunt-v2/index.html'])assert.ok((await read(file)).toString().includes('sx=20261007-2x-v1'),file);
});
