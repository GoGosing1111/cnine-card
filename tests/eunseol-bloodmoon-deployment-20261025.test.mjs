import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {BLOODMOON_CODES} from '../shared/mercenary-bloodmoon-catalog-v1.mjs';
import {BLOODMOON_COMBAT} from '../shared/mercenary-bloodmoon-combat-v1.mjs';
import {BLOODMOON_COMBAT as prepared} from '../preview/mercenary-bloodmoon-battle-20261023-v1/balance.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {saveMercenaryLoadout,loadMercenaryBattleSnapshot,mercenaryAccountState,rankedOwnedMercenaries} from '../functions/_mercenary_account.js';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
test('all six Bloodmoon cards deploy immediately in both modes at starting account rank; ownership remains required',async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),coin=await f.coin();
 for(const code of BLOODMOON_CODES){
  for(const mode of ['PVE','PVP']){
   const revision=(await mercenaryAccountState(f.env,f.user)).loadouts[mode].revision;
   await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:code,revision}),{code:'MERCENARY_NOT_OWNED'});
  }
  await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,code,'2026-10-25','2026-10-25').run();
  for(const mode of ['PVE','PVP']){
   const revision=(await mercenaryAccountState(f.env,f.user)).loadouts[mode].revision;
   await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:code,revision});
   assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).code,code);
  }
  assert((await rankedOwnedMercenaries(f.env,[7])).get(7).some(c=>c.code===code));
 }
 assert.equal(await f.coin(),coin);assert((await mercenaryAccountState(f.env,f.user)).cards.filter(c=>BLOODMOON_CODES.includes(c.code)).every(c=>c.totalCopies===1));
});
test('existing five prepared skill budgets and combat multipliers remain exact',()=>{
 for(const [code,p]of Object.entries(BLOODMOON_COMBAT)){
  for(const key of ['basePower','scale','speedScale','actionCredit','actionEnergy','pvpSkillCapScale','basicCapScale','pveSkillMinimumDamage','link'])assert.deepEqual(p[key],prepared[code][key]);
  assert.deepEqual(p.skill.balance,prepared[code].skill.balance);assert.equal(p.skill.mechanic,prepared[code].skill.mechanic);
 }
});
for(const code of BLOODMOON_CODES)test(code+' is an actual fighter with successful server skill hits in PVE and PVP',()=>{
 const snapshot={...limitedDeploymentSnapshot(code),combat:fixture.combat};
 const cards=Array.from({length:5},(_,i)=>({id:String(i+1),rarity:'FUR',power:20000000,power_type:'ATTACK'}));
 const pve=createPveBattleV2({cards,mercenary:snapshot,monster:{id:1,battle_power:1.6e10},seed:77});
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot,defenderMercenary:snapshot,seed:77});
 for(const battle of [pve,pvp]){
  assert.equal(battle.teams.A.mercenaries[0].cardId,code);
  assert(battle.result.timeline.some(e=>e.actorId?.endsWith(':MERCENARY:'+code)&&e.type.startsWith('MERCENARY_')&&(e.damage>0||e.hits?.some(h=>h.damage>0))),code+' skill damage');
 }
 assert.equal(pvp.teams.B.mercenaries[0].cardId,code);
});
test('packed runtime images ship; authoring originals and Node runners remain in Git',()=>{
 const root='assets/ui/project-v/mercenaries/bloodmoon-live-20261025/',m=JSON.parse(fs.readFileSync(root+'manifest.json'));
 for(const c of m.characters)for(const spec of [...Object.values(c.motion),c.effects.skill]){assert(fs.existsSync(root+spec.path));assert(isProductionFile(root+spec.path));}
 const files=JSON.parse(fs.readFileSync('scripts/bloodmoon-deployment-node-only-20261025.json'));assert.equal(files.length,17);
 for(const file of files){assert.match(fs.readFileSync(file,'utf8'),/from ['"]node:/);assert(!isProductionFile(file));}
});
