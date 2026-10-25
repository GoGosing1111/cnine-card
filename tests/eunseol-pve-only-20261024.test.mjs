import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {EUNSEOL_CODE} from '../shared/mercenary-eunseol-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,releasedMercenarySnapshot,releasedMercenarySnapshots,rankedOwnedMercenaries,rankedSelectedMercenaries} from '../functions/_mercenary_account.js';
import {mercenaryPvpLoadoutKey} from '../functions/_mercenary_loadout_modes.js';
import {rankedOwnershipGuard,saveRankedRoster} from '../functions/_ranked_series.js';
import {hasRankedDuoMercenary,rankedDuoPoolCount} from '../functions/_ranked_duo_pool.js';
import {createPvpBattleV2,createPveBattleV2,buildAvatarMercenaryFighter} from '../functions/_battle_v2_preview.js';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';

const id=()=>crypto.randomUUID();
const save=(f,mode,code,revision=0)=>saveMercenaryLoadout(f.env,f.user,{requestId:id(),mode,mercenaryCode:code,revision});
async function own(f,code){await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,code,'2026-10-24','2026-10-24').run();}

for(const postgres of [false,true]){
 test(`${postgres?'PostgreSQL':'SQLite'}: Eunseol remains deployable in PVE and is accepted by PVP and ranked saves`,async t=>{
  const f=await mercenaryFixture(t,{postgres});
  for(const code of [EUNSEOL_CODE,'V-001','V-002'])await own(f,code);
  const before=await f.coin();
  await save(f,'PVE',EUNSEOL_CODE);
  const state=await mercenaryAccountState(f.env,f.user);
  assert.deepEqual(state.cards.find(c=>c.code===EUNSEOL_CODE).deploymentModes,['PVE','PVP']);
  assert.equal((await releasedMercenarySnapshot(f.env,f.user,'PVE')).code,EUNSEOL_CODE);
  await save(f,'PVP',EUNSEOL_CODE);
  assert.equal((await releasedMercenarySnapshot(f.env,f.user,'PVP')).code,EUNSEOL_CODE);
  assert((await rankedOwnedMercenaries(f.env,[7])).get(7).some(c=>c.code===EUNSEOL_CODE));
  const codes=[EUNSEOL_CODE,'V-001','V-002'];
  if(postgres)await f.pg.exec('CREATE TABLE pvp_ranked_match_tickets_v1671(attacker_id BIGINT,used_at TEXT,expires_at TEXT)');else await f.p('CREATE TABLE pvp_ranked_match_tickets_v1671(attacker_id INTEGER,used_at TEXT,expires_at TEXT)').run();
  await saveRankedRoster(f.env,f.user,{codes,revision:0});
  await f.env.DB.batch(rankedOwnershipGuard(f.env,new Map([[7,codes]])));
  assert((await rankedSelectedMercenaries(f.env,new Map([[7,codes]]))).get(7).some(c=>c.code===EUNSEOL_CODE));
  await save(f,'PVP','V-001',1);
  assert.equal((await releasedMercenarySnapshot(f.env,f.user,'PVP')).code,'V-001');
  assert.equal((await releasedMercenarySnapshot(f.env,f.user,'PVE')).code,EUNSEOL_CODE);
  assert.equal(await f.coin(),before);
 });

 test(`${postgres?'PostgreSQL':'SQLite'}: saved and legacy-inherited Eunseol PVP slots are available with ownership, independently from PVE`,async t=>{
  const f=await mercenaryFixture(t,{postgres});await own(f,EUNSEOL_CODE);
  await f.p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(7,?,4,?)',EUNSEOL_CODE,'2026-10-24').run();
  for(const explicit of [false,true]){
   if(explicit)await f.setting(mercenaryPvpLoadoutKey(7),{mercenaryCode:EUNSEOL_CODE,revision:9});
   assert.equal((await releasedMercenarySnapshot(f.env,f.user,'PVP')).code,EUNSEOL_CODE);
   assert.equal((await releasedMercenarySnapshots(f.env,[7],'PVP')).size,1);
   const state=await mercenaryAccountState(f.env,f.user);
   assert.equal(state.loadouts.PVP.mercenaryCode,EUNSEOL_CODE);assert(!state.loadouts.PVP.blockedMercenaryCode);
   assert.equal(state.loadouts.PVE.mercenaryCode,EUNSEOL_CODE);
   assert.equal((await releasedMercenarySnapshots(f.env,[7],'PVE')).get(7).code,EUNSEOL_CODE);
  }
  await save(f,'PVP',null,9);
  assert.equal((await mercenaryAccountState(f.env,f.user)).loadouts.PVE.mercenaryCode,EUNSEOL_CODE);
 });
}

test('stale supplied battle snapshots instantiate Eunseol on either PVP side, with or without avatar power',()=>{
 const snapshot=limitedDeploymentSnapshot(EUNSEOL_CODE);
 const cards=Array.from({length:5},(_,i)=>({id:String(i+1),rarity:'FUR',power:10000,power_type:'ATTACK'}));
 for(const avatar of [0,20]){
  assert.equal(buildAvatarMercenaryFighter(snapshot,'A','PVP',avatar).code,EUNSEOL_CODE);
  const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot,defenderMercenary:snapshot,attackerAvatarPowerPercent:avatar,defenderAvatarPowerPercent:avatar});
  assert.equal(pvp.teams.A.mercenaries?.length||0,1);assert.equal(pvp.teams.B.mercenaries?.length||0,1);
 }
 const pve=createPveBattleV2({cards,mercenary:snapshot,monster:{id:1,battle_power:100000}});
 assert.equal(pve.teams.A.mercenaries[0].cardId,EUNSEOL_CODE);
 assert.equal(hasRankedDuoMercenary({attack:{mercenary:snapshot},defense:{mercenary:snapshot}}),true);
});

test('duo matchmaking includes explicit and inherited Eunseol while retaining eligible PVP mercenaries',async t=>{
 const f=await duoFixture(t);
 for(const user of [2,3]){
  await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1)',user,EUNSEOL_CODE).run();
  await f.p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code) VALUES(?,?)',user,EUNSEOL_CODE).run();
 }
 await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',mercenaryPvpLoadoutKey(3),JSON.stringify({mercenaryCode:EUNSEOL_CODE,revision:1})).run();
 assert.equal(await rankedDuoPoolCount(f.env,Date.now()),2);
 await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(2,'V-001',1)").run();
 await f.p("UPDATE user_mercenary_loadout_v1 SET mercenary_code='V-001' WHERE user_id=2").run();
 assert.equal(await rankedDuoPoolCount(f.env,Date.now()),2);
});

test('duo profile rebuilding includes Eunseol in potential power and equipped attack/defense',async t=>{
 const f=await duoFixture(t);await f.ready();
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(2,?,1)',EUNSEOL_CODE).run();
 await f.p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code) VALUES(2,?)',EUNSEOL_CODE).run();
 const [profile]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});
 assert.equal(profile.attack.mercenary.code,EUNSEOL_CODE);assert.equal(profile.defense.mercenary.code,EUNSEOL_CODE);
 assert(profile.breakdown.mercenaryPower>0);assert.deepEqual(profile.breakdown.mercenaryRanks,[{code:EUNSEOL_CODE,rank:'SSS'}]);
});
