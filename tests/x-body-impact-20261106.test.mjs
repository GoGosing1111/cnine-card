import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {run,input,pvp} from '../docs/qa/x-body-impact-20261106/probe.mjs';
import {simulateBattleV2Preview,buildBattleSuitFighter} from '../functions/_battle_v2_preview.js';
const engineUrl=new URL('../functions/_battle_v2_preview.js',import.meta.url);
const baseline=JSON.parse(fs.readFileSync(new URL('../docs/qa/x-body-impact-20261106/unchanged-baseline.json',import.meta.url)));
const oldSource=execFileSync('git',['-c','gc.auto=0','show',baseline.baseline+':functions/_battle_v2_preview.js'],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true,maxBuffer:4e6});
const old=await import('data:text/javascript;base64,'+Buffer.from(oldSource.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,engineUrl).href))).toString('base64'));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const landed=r=>r.timeline.filter(e=>e.actorKind==='BATTLE_SUIT'&&e.type==='TURN'&&!e.dodge);
const casts=r=>r.timeline.filter(e=>e.type==='SKILL_CHIP_CAST');
for(const apocalypse of [false,true])test(`X outgoing packets scale once and retain cadence, caps and defense: apocalypse=${apocalypse}`,()=>{
 const args=input({apocalypse});
 // Keep the target alive for every scheduled packet even after the increase.
 args.teamB[0].hp=args.teamB[0].maxHp=1e15;args.teamB[0].shield=args.teamB[0].maxShield=2e14;
 const before=old.simulateBattleV2Preview(structuredClone(args)),after=simulateBattleV2Preview(structuredClone(args));
 const oldShots=landed(before),newShots=landed(after),oldCasts=casts(before),newCasts=casts(after);
 assert(newShots.length>0);assert.equal(newShots.length,oldShots.length);
 for(const [i,b]of newShots.entries()){
  const a=oldShots[i];assert.equal(b.damage+b.absorbed,(a.damage+a.absorbed)*32);assert.equal(b.apocalypsePierce||0,(a.apocalypsePierce||0)*32);assert.equal(b.combatAtMs,a.combatAtMs);
 }
 assert.equal(newCasts.length,oldCasts.length);
 for(const [i,b]of newCasts.entries()){
  const a=oldCasts[i];assert.equal(b.baseDamage,a.baseDamage*32);assert.equal(b.calculatedDamage,a.calculatedDamage*32);
  assert.deepEqual(b.impactOffsetsMs,a.impactOffsetsMs);assert.equal(b.combatAtMs,a.combatAtMs);assert.equal(b.damageMultiplier,a.damageMultiplier);
  const hits=after.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===b.castId);
  // The last cast can begin before the 65-second stop without all its contacts.
  if(hits.length===b.impactOffsetsMs.length)assert.equal(hits.reduce((s,e)=>s+e.damage+e.absorbed,0),b.calculatedDamage);
 }
 assert.equal(after.actions,before.actions);
});
test('Z/H/S/Overlord/SX and PVP retain the exact pre-change battle output',()=>{
 for(const row of baseline.rows)assert.equal(sha(row.pvp?pvp():run(row)),row.sha256,JSON.stringify(row));
});
test('X scaling follows power, excludes zero power and refuses a PVP actor',()=>{
 for(const power of [1,100000,25000000,50000000]){
  const args=input({power}),before=old.simulateBattleV2Preview(structuredClone(args)),after=simulateBattleV2Preview(structuredClone(args));
  assert.equal(casts(after)[0].calculatedDamage,casts(before)[0].calculatedDamage*32);
 }
 assert.equal(casts(run({power:0})).length,0);
 const args=input({pvpActor:true});assert.deepEqual(simulateBattleV2Preview(structuredClone(args)),old.simulateBattleV2Preview(structuredClone(args)));
});
test('X keeps AR/DMR/sniper weapon intervals while scaling each damage packet once',()=>{
 for(const weaponCode of ['', 'EQ_1785427638137','EQ_1785961232958','EQ_1785961300455','EQ_1786966923833','EQ_1788486929132','EQ_1788486888336']){
  const args=input({apocalypse:true});args.maxCombatDurationMs=6000;args.teamA[5]=buildBattleSuitFighter({code:'BATTLE_SUIT_X_BODY',pvePower:50000000,weaponCode});
  const before=old.simulateBattleV2Preview(structuredClone(args)),after=simulateBattleV2Preview(structuredClone(args)),a=landed(before)[0],b=landed(after)[0];
  assert(a&&b);assert.equal(b.damage+b.absorbed,(a.damage+a.absorbed)*32);assert.equal(b.combatAtMs,a.combatAtMs);assert.equal(b.apocalypsePierce,(a.apocalypsePierce||0)*32);
 }
});
test('every applied hit keeps server HP/shield accounting and cannot overflow a dead target',()=>{
 const args=input({apocalypse:true});args.teamB[0].hp=args.teamB[0].maxHp=2e8;args.teamB[0].shield=args.teamB[0].maxShield=1e8;
 const after=simulateBattleV2Preview(args);let hp=2e8,shield=1e8,observed=0;
 for(const e of after.timeline){if(e.targetId!==args.teamB[0].id||!Number.isFinite(e.targetHpAfter)||!Number.isFinite(e.targetShieldAfter))continue;
  if(e.actorKind==='BATTLE_SUIT'){assert.equal(hp-e.targetHpAfter,e.damage);assert.equal(shield-e.targetShieldAfter,e.absorbed);observed++;}
  hp=e.targetHpAfter;shield=e.targetShieldAfter;assert(hp>=0&&shield>=0);
 }
 assert(observed>0);assert.equal(hp,0);
});
