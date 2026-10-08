import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {mercenaryAccountState,saveMercenaryLoadout,releasedMercenarySnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {readMercenaryModes,mercenaryPvpLoadoutKey} from '../functions/_mercenary_loadout_modes.js';
import {handleMercenaryAccountReady} from '../functions/_mercenary_account_routes.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
const rid=()=>crypto.randomUUID();
async function fixture(t,postgres){const f=await mercenaryFixture(t,{postgres});for(const code of ['V-001','V-002'])await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:code,acquisitionId:rid()}));return f;}
const save=(f,mode,mercenaryCode,revision,requestId=rid())=>saveMercenaryLoadout(f.env,f.user,{mode,mercenaryCode,revision,requestId});
const slots=async f=>(await mercenaryAccountState(f.env,f.user)).loadouts;
for(const postgres of [false,true]){
 const db=postgres?'PostgreSQL':'SQLite';
 test(`${db}: different and identical mercenaries are independently equipped, cleared and loaded for each battle mode`,async t=>{
  const f=await fixture(t,postgres),wallet=await f.coin();
  await save(f,'PVE','V-001',0);await save(f,'PVP','V-002',0);
  assert.deepEqual(await slots(f),{PVE:{mercenaryCode:'V-001',revision:1},PVP:{mercenaryCode:'V-002',revision:1}});
  for(const [mode,code] of [['PVE','V-001'],['PVP','V-002']]){assert.equal((await releasedMercenarySnapshot(f.env,f.user,mode)).code,code);assert.equal((await releasedMercenarySnapshots(f.env,[7,7,8],mode)).get(7).code,code);}
  const cards=Array.from({length:5},(_,i)=>({id:String(i+1),title:'카드 '+i,rarity:'FUR',power:10000,power_type:'ATTACK'}));
  const pve=createPveBattleV2({cards,mercenary:await releasedMercenarySnapshot(f.env,f.user,'PVE'),monster:{id:1,name:'검수',battle_power:100000},seed:7});
  const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:await releasedMercenarySnapshot(f.env,f.user,'PVP'),defenderMercenary:await releasedMercenarySnapshot(f.env,f.user,'PVP'),seed:7});
  assert.equal(pve.teams.A.cards.length,5);assert.equal(pve.teams.A.mercenaries[0].cardId,'V-001');
  for(const team of [pvp.teams.A,pvp.teams.B]){assert.equal(team.cards.length,5);assert.equal(team.mercenaries.length,1);assert.equal(team.mercenaries[0].cardId,'V-002');}
  const requestId=rid();await save(f,'PVP','V-001',1,requestId);assert.equal((await save(f,'PVP','V-001',1,requestId)).replayed,true);
  assert.deepEqual(await slots(f),{PVE:{mercenaryCode:'V-001',revision:1},PVP:{mercenaryCode:'V-001',revision:2}});
  await assert.rejects(()=>save(f,'PVE','V-001',1,requestId),{code:'JOINT_REQUEST_CONFLICT'});
  await save(f,'PVE',null,1);assert.equal(await releasedMercenarySnapshot(f.env,f.user,'PVE'),null);assert.equal((await releasedMercenarySnapshot(f.env,f.user,'PVP')).code,'V-001');
  await assert.rejects(()=>save(f,'PVP',null,1),{code:'MERCENARY_LOADOUT_CONFLICT'});
  await save(f,'PVP',null,2);assert.equal((await releasedMercenarySnapshots(f.env,[7],'PVP')).size,0);
  assert.equal(await f.coin(),wallet);assert.equal(Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?','V-001').first()).total_copies),1);
 });
 for(const first of ['PVE','PVP'])test(`${db}: existing shared slot is inherited and preserved when ${first} changes first`,async t=>{
  const f=await fixture(t,postgres);await f.p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(7,?,4,?)','V-001','2026-10-09').run();
  assert.deepEqual(await slots(f),{PVE:{mercenaryCode:'V-001',revision:4},PVP:{mercenaryCode:'V-001',revision:4}});
  await save(f,first,'V-002',4);const other=first==='PVE'?'PVP':'PVE';
  assert.deepEqual((await slots(f))[other],{mercenaryCode:'V-001',revision:4});
  await save(f,other,null,4);assert.equal((await slots(f))[first].mercenaryCode,'V-002');
 });
 test(`${db}: metadata failure rolls back both slots; same receipt safely retries and another mode change does not invalidate its revision`,async t=>{
  const f=await fixture(t,postgres),requestId=rid();f.fail('INSERT INTO app_meta');
  await assert.rejects(()=>save(f,'PVE','V-001',0,requestId));
  assert.deepEqual(await slots(f),{PVE:{mercenaryCode:null,revision:0},PVP:{mercenaryCode:null,revision:0}});
  f.fail('');await save(f,'PVP','V-002',0);await save(f,'PVE','V-001',0,requestId);
  assert.equal((await slots(f)).PVP.mercenaryCode,'V-002');
  await assert.rejects(()=>save(f,'PVP','V-003',1),{code:'MERCENARY_NOT_OWNED'});
  const legacy={requestId:rid(),mercenaryCode:null,revision:1};await saveMercenaryLoadout(f.env,f.user,legacy);assert.equal((await saveMercenaryLoadout(f.env,f.user,legacy)).replayed,true);assert.equal((await slots(f)).PVP.mercenaryCode,'V-002');
 });
 test(`${db}: route accepts explicit mode and rejects invalid modes; malformed stored slot cannot silently inherit`,async t=>{
  const f=await fixture(t,postgres),path='mercenaries/v3/loadout';
  const call=mode=>handleMercenaryAccountReady({env:f.env,deps:f.deps,path,request:new Request('https://game.test/api/'+path,{method:'POST',headers:{origin:'https://game.test',authorization:'Bearer local-account-7','content-type':'application/json'},body:JSON.stringify({requestId:rid(),mode,mercenaryCode:'V-001',revision:0})})});
  assert.equal((await call('PVP')).status,200);assert.equal((await slots(f)).PVE.mercenaryCode,null);
  for(const invalid of ['pvp','DUO',null,{},[]])assert.equal((await call(invalid)).status,400);
  await f.p('UPDATE app_meta SET value=? WHERE key=?','{}',mercenaryPvpLoadoutKey(7)).run();
  await assert.rejects(()=>readMercenaryModes(f.env,[7]),{code:'MERCENARY_LOADOUT_STATE'});
 });
}
