import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as after from '../functions/_battle_v2_preview.js';

const source=readFileSync(new URL('../functions/_battle_v2_preview.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
assert.equal(source.split('fighter.gauge=0;').length,2);
const baseline=source.replace('fighter.gauge=0;','fighter.gauge=0;fighter.speedUniqueSuppressed=true;').replace('방어형 연계 · 행동 속도 봉쇄','방어형 연계 · 속도 봉쇄').replace(' * pvpSpeedDamage','').replace('healerTargets.length ? healerTargets : targetPool(enemyTeam)','targetPool(enemyTeam)');
const before=await import('data:text/javascript;base64,'+Buffer.from(baseline.replace('../shared/battle-suit-skill-chips.mjs',new URL('../shared/battle-suit-skill-chips.mjs',import.meta.url).href)).toString('base64'));
const inspect=await import('data:text/javascript;base64,'+Buffer.from((source+'\nexport {hitResult};').replace('../shared/battle-suit-skill-chips.mjs',new URL('../shared/battle-suit-skill-chips.mjs',import.meta.url).href)).toString('base64'));
const inspectOld=await import('data:text/javascript;base64,'+Buffer.from((baseline+'\nexport {hitResult};').replace('../shared/battle-suit-skill-chips.mjs',new URL('../shared/battle-suit-skill-chips.mjs',import.meta.url).href)).toString('base64'));
test('PVP speed damage: healer +50%, others +15%, unchanged PVE/counters/caps',()=>{
  for(const battleMode of ['PVP','PVE'])for(const type of ['ATTACK','DEFENSE','HP','SPEED'])for(const counter of [false,true])for(const targetType of ['HP','DEFENSE']){
    const actor={type,battleMode,attack:1000,actions:2},target={type:targetType,defense:100,hp:100000,maxHp:100000,shield:0};
    const old=inspectOld.hitResult(actor,target,()=>0.5,1,counter),now=inspect.hitResult(actor,target,()=>0.5,1,counter);
    if(battleMode==='PVP'&&type==='SPEED'&&!counter)assert.ok(Math.abs(now.damage-old.damage*(targetType==='HP'?1.50:1.15))<=1);
    else assert.deepEqual(now,old);
  }
  const actor={type:'SPEED',battleMode:'PVP',attack:1e9,actions:2},target={type:'HP',defense:0,hp:1000,maxHp:1000};
  assert.equal(inspect.hitResult(actor,target,()=>0.5).damage,inspectOld.hitResult(actor,target,()=>0.5).damage);
});
const card=(type,value,id)=>({id,title:id,power:120000,rarity:'FUR',uniqueAbility:{dominantType:type,attackPercent:type==='ATTACK'?value:0,defensePercent:type==='DEFENSE'?value:0,hpPercent:type==='HP'?value:0,speedPercent:type==='SPEED'?value:0}});
const core=()=>[card('DEFENSE',14,'d'),card('HP',25,'h'),card('ATTACK',22,'a'),card('ATTACK',50,'b')];
let state=2063;
const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
// Synthetic distribution fixture, NOT the unavailable historical CMS card pool.
const pool=[...Array(32).fill('ATTACK'),...Array(16).fill('HP'),...Array(12).fill('DEFENSE'),...Array(10).fill('SPEED')];
const deck=()=>Array.from({length:5},(_,i)=>{const t=pool[Math.floor(random()*pool.length)];return card(t,{ATTACK:22,HP:25,DEFENSE:14,SPEED:9}[t],`r${i}`);});
const opponents=Array.from({length:36},deck);
const pvp=(engine,a,b,seed)=>engine.createPvpBattleV2({attackerCards:a,defenderCards:b,attackerEquipmentBonus:500000,defenderEquipmentBonus:500000,seed});
test('assassins attack only living healers, bypass frontline, then resume normal targets',()=>{
  let healerHits=0,fallbackHits=0;
  for(let seed=1;seed<=100;seed++){
    const a=[card('DEFENSE',14,'d'),card('DEFENSE',14,'d2'),card('SPEED',50,'s'),card('SPEED',30,'s2'),card('ATTACK',22,'a')];
    const b=[card('DEFENSE',14,'f1'),card('ATTACK',22,'f2'),card('HP',25,'h1'),card('HP',25,'h2'),card('ATTACK',22,'back')];
    const battle=pvp(after,a,b,seed),healers=new Set(battle.teams.B.cards.filter(c=>c.type==='HP').map(c=>c.id));
    const speedIds=new Set(battle.teams.A.cards.filter(c=>c.type==='SPEED').map(c=>c.id));
    for(const e of battle.result.timeline){
      if(e.type==='TURN'&&speedIds.has(e.actorId)){
        if(healers.size){assert.ok(healers.has(e.targetId),`seed ${seed}: ${e.targetId}`);healerHits++;}
        else fallbackHits++;
      }
      if(e.type==='KO')healers.delete(e.targetId);
    }
  }
  assert.ok(healerHits>0);assert.ok(fallbackHits>0);
});
test('B4 preserves other suppression hooks and only narrows the assignment',()=>{
  assert.doesNotMatch(source,/speedUniqueSuppressed=true/);
  assert.match(source,/speedUniqueSuppressed: false/);
  assert.equal((source.match(/!\w+\.speedUniqueSuppressed/g)||[]).length,3);
  const a=[...core(),card('SPEED',50,'s')],b=[...core().slice(0,3),card('DEFENSE',14,'d2'),card('ATTACK',22,'a2')];
  const old=pvp(before,a,b,2063),now=pvp(after,a,b,2063);
  assert.ok(now.result.timeline.some(e=>e.type==='SPEED_UNIQUE_SUPPRESSED'&&e.label==='방어형 연계 · 행동 속도 봉쇄'));
  assert.notDeepEqual(now.result,old.result);
});
for(const mode of ['hunt','idle','siege','escort'])test(`PVE ${mode}: 100 identical complete results, zero suppression`,()=>{
  for(let i=0;i<100;i++){
    const args={cards:[...core(),card('SPEED',9+i%42,'s')],characterBonus:500000,seed:1000+i*7919,monster:{id:mode,name:mode,battle_power:200000+i*25000,is_boss:mode==='siege'?1:0},...(mode==='escort'?{escortObjective:{id:'ESCORT_OBJECTIVE',name:'수송차'}}:{})};
    const a=before.createPveBattleV2(args),b=after.createPveBattleV2(args);
    assert.deepEqual(b,a,`${mode} seed ${args.seed}`);
    assert.equal(b.result.timeline.filter(e=>e.type==='SPEED_UNIQUE_SUPPRESSED').length,0);
  }
});
test('600 random PVP pairs: valid timelines, overtime comparison, no-speed parity',()=>{
  let oldOvertime=0,newOvertime=0,unchanged=0;
  for(let i=0;i<600;i++){
    const a=deck(),b=deck(),old=pvp(before,a,b,5000+i*7919),now=pvp(after,a,b,5000+i*7919);
    assert.equal(now.schemaVersion,old.schemaVersion);
    assert.deepEqual(Object.keys(now.result).sort(),Object.keys(old.result).sort());
    for(const e of now.result.timeline){assert.equal(typeof e.type,'string');assert.ok(Number.isFinite(e.at));}
    oldOvertime+=Number(old.result.timeline.some(e=>e.type==='SUDDEN_DEATH'));
    newOvertime+=Number(now.result.timeline.some(e=>e.type==='SUDDEN_DEATH'));
    if(![...a,...b].some(c=>c.uniqueAbility.dominantType==='SPEED')){assert.deepEqual(now,old);unchanged++;}
  }
  console.log(JSON.stringify({randomPvp:600,oldOvertime,newOvertime,unchangedWithoutSpeed:unchanged}));
});
test('independent mixed-deck benchmark: 36 opponents x 10 seeds x both sides',()=>{
  const rows=[];
  for(const [type,value] of [['NONE',0],['SPEED',9],['SPEED',30],['SPEED',50],['ATTACK',22],['ATTACK',50],['DEFENSE',14]]){
    const a=[...core(),card(type,value,'fifth')];let oldWins=0,newWins=0;
    for(const b of opponents)for(let s=0;s<10;s++)for(const reverse of [false,true]){
      const left=reverse?b:a,right=reverse?a:b,side=reverse?'B':'A',seed=1000+s*7919;
      oldWins+=Number(pvp(before,left,right,seed).result.winner===side);
      newWins+=Number(pvp(after,left,right,seed).result.winner===side);
    }
    rows.push({type,value,before:oldWins,after:newWins,total:720});
  }
  console.log('SYNTHETIC_NOT_HISTORICAL '+JSON.stringify(rows));
});
