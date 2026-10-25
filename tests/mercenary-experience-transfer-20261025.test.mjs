import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureMercenaryLevelSchema,readMercenaryLevelState} from '../functions/_mercenary_level_policy.js';
import {MERCENARY_LEVEL_KEY,mercenaryLevelDraft,mercenaryGrowthDraft} from '../shared/mercenary-level-v1.mjs';
import {runPreparedMercenaryLevel,previewExperienceExtraction,previewItemExperienceTransfer,handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {readExperienceTransfer,readTransferItemQuantity,experienceTransferInventory,experienceTransferKey} from '../functions/_mercenary_experience_transfer.js';
import {transferGroup,emptyTransferState,retainedMercenaryXp,applyTransferXp} from '../shared/mercenary-experience-transfer-v1.mjs';
import {mercenaryPityFromHistory,readMercenaryBreakthroughHistory} from '../functions/_mercenary_level_pity.js';
import {createLevelClient,validateLevelReceipt} from '../mercenary-codex/leveling/client.mjs';
import {transferFixturePolicy,transferFixture} from './helpers/mercenary-experience-transfer-db.mjs';
const rows=async f=>(await f.p('SELECT * FROM user_mercenary_cards_v1 ORDER BY mercenary_code').all()).results;
test('XP grouping, odd XP floor, max level costs and checkpoint banking are exact',()=>{
 const policy=transferFixturePolicy(),target={code:'V-049',rank:'SSS'},limited={code:'V-996',rank:'SSS'};
 assert.equal(transferGroup(target),'SSS');assert.equal(transferGroup(limited),'SSS_LIMITED');assert.equal(transferGroup({code:'V-001',rank:'S'}),'S');
 const transfer={used:false,bankedXp:0,resetRevision:0};
 const x=retainedMercenaryXp({policy,target,state:{level:21,experience:0,breakthroughMask:15,revision:21},transfer});assert.equal(x.totalXp,6000);assert.equal(x.xp,3000);
 assert.equal(retainedMercenaryXp({policy,target,state:{level:1,experience:101,breakthroughMask:0,revision:1},transfer}).xp,50);
 const r=applyTransferXp({policy,target,state:{level:1,experience:0,breakthroughMask:0,revision:1},xp:5000});assert.deepEqual(r.after,{level:5,experience:300,breakthroughMask:0,revision:1});assert.equal(r.appliedXp,1500);assert.equal(r.bankedXp,3500);
});
test('completed level costs use the receipt policy and exclude failures/overflow',()=>{
 const policy=transferFixturePolicy(),old=structuredClone(policy);old.levels.forEach(r=>r.requiredXp=100);
 const xp=retainedMercenaryXp({policy,target:{code:'V-049',rank:'SSS'},state:{level:3,experience:51,breakthroughMask:0,revision:3},transfer:{bankedXp:0,resetRevision:0},history:[{plan:{action:'TRAIN',mercenaryCode:'V-049',policyRaw:JSON.stringify(old),result:{before:{level:1,revision:0},after:{level:3,revision:1},xp:2000,overflowXp:1800}}}]});assert.equal(xp.totalXp,251);assert.equal(xp.xp,125);assert.equal(xp.fallbackLevels,0);
});

for(const postgres of [false,true]){
 const db=postgres?'PostgreSQL':'SQLite';
 test(`${db}: missing or inactive real potion cannot preview, reset, transfer or mint`,async t=>{
  const f=await transferFixture(t,postgres);await f.setState('V-049',{level:16,experience:101,breakthroughMask:7,revision:10});
  const body=await f.transferBody();
  await assert.rejects(previewItemExperienceTransfer(f.env,f.user,body),{code:'MERCENARY_TRANSFER_ITEM_REQUIRED'});
  await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,{...body,expectedXp:2300},'TRANSFER'),{code:'MERCENARY_TRANSFER_ITEM_REQUIRED'});
  for(const action of ['EXTRACT','INFUSE'])await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,body,action),{code:'MERCENARY_TRANSFER_LEGACY_DISABLED'});
  await f.givePotion();await f.p("UPDATE inventory_items SET is_active=0 WHERE code='MERCENARY_XP_TRANSFER_POTION'").run();
  await assert.rejects(previewItemExperienceTransfer(f.env,f.user,body),{code:'MERCENARY_TRANSFER_ITEM_REQUIRED'});
  assert.equal((await readMercenaryLevelState(f.env,7,'V-049')).level,16);assert.equal((await readMercenaryLevelState(f.env,7,'V-055')).revision,0);
  assert.equal((await readExperienceTransfer(f.env,7)).state.potions.length,0);assert.deepEqual(await experienceTransferInventory(f.env,7),[]);
  assert.equal((await f.p('SELECT * FROM inventory_logs').all()).results.length,0);
 });
 test(`${db}: one owned item atomically transfers half, banks at checkpoints and replays once`,async t=>{
  const f=await transferFixture(t,postgres),original=await rows(f),coin=await f.coin();await f.givePotion(2);await f.setState('V-049',{level:16,experience:101,breakthroughMask:7,revision:10});
  const b=await f.transferBody(),q=await previewItemExperienceTransfer(f.env,f.user,b);assert.equal(q.expectedXp,2300);assert.equal(await readTransferItemQuantity(f.env,7),2);assert.equal((await readMercenaryLevelState(f.env,7,'V-049')).level,16);
  const body={...b,expectedXp:q.expectedXp},r=await runPreparedMercenaryLevel(f.env,f.user,body,'TRANSFER');validateLevelReceipt(r,body.requestId);
  assert.equal(r.result.totalXp,4601);assert.deepEqual(r.result.source.after,{level:1,experience:0,breakthroughMask:0,revision:11});assert.equal(r.result.after.level,5);assert.equal(r.result.appliedXp,1500);assert.equal(r.result.bankedXp,800);
  assert.equal(await readTransferItemQuantity(f.env,7),1);assert.equal((await runPreparedMercenaryLevel(f.env,f.user,body,'TRANSFER')).replayed,true);assert.equal(await readTransferItemQuantity(f.env,7),1);
  const logs=(await f.p('SELECT * FROM inventory_logs').all()).results;assert.equal(logs.length,1);assert.equal(Number(logs[0].change_amount),-1);assert.equal(logs[0].reference_id,body.requestId);
  const br=await runPreparedMercenaryLevel(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-055',revision:1},'BREAKTHROUGH',{randomInt:()=>0});assert.equal(br.result.after.level,8);assert.equal(br.result.after.experience,200);
  await f.transfer('V-055','V-049');assert.equal((await readExperienceTransfer(f.env,7)).state.mercenaries['V-055'].used,true);await f.givePotion();
  await assert.rejects(f.transfer('V-049','V-055'),{code:'MERCENARY_TRANSFER_USED'});assert.equal(await readTransferItemQuantity(f.env,7),1);
  assert.equal((await readExperienceTransfer(f.env,7)).state.potions.length,0);assert.deepEqual(await rows(f),original);assert.equal(await f.coin(),coin);
 });
 test(`${db}: wrong rank, own source, nonownership, maximum, stale states and altered quote cannot spend`,async t=>{
  const f=await transferFixture(t,postgres);await f.givePotion();await f.setState('V-049',{level:5,experience:300,breakthroughMask:0,revision:2});
  for(const code of ['V-001','V-996'])await assert.rejects(f.transfer('V-049',code),{code:'MERCENARY_TRANSFER_RANK'});
  await assert.rejects(f.transfer('V-049','V-049'),{code:'MERCENARY_TRANSFER_SOURCE'});
  await assert.rejects(previewItemExperienceTransfer(f.env,{id:8},await f.transferBody()),{code:'MERCENARY_LEVEL_NOT_OWNED'});
  const b=await f.transferBody();
  await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,{...b,expectedXp:1},'TRANSFER'),{code:'MERCENARY_TRANSFER_QUOTE'});
  await assert.rejects(previewItemExperienceTransfer(f.env,f.user,{...b,sourceRevision:1}),{code:'MERCENARY_LEVEL_CONFLICT'});
  await assert.rejects(previewItemExperienceTransfer(f.env,f.user,{...b,transferRevision:1}),{code:'MERCENARY_LEVEL_CONFLICT'});
  await f.setState('V-055',{level:21,experience:0,breakthroughMask:15,revision:5});await assert.rejects(f.transfer(),{code:'MERCENARY_TRANSFER_MAX'});
  assert.equal(await readTransferItemQuantity(f.env,7),1);assert.equal((await readMercenaryLevelState(f.env,7,'V-049')).level,5);
  await f.setState('V-996',{level:2,experience:0,breakthroughMask:0,revision:1});const limited=await f.transfer('V-996','V-999');assert.equal(limited.result.xp,750);
 });
 test(`${db}: failure after debit and both level writes rolls back; retry and competing requests spend once`,async t=>{
  const f=await transferFixture(t,postgres);await f.givePotion();await f.setState('V-049',{level:5,experience:300,breakthroughMask:0,revision:4});const b={...await f.transferBody(),expectedXp:750};
  f.fail('INSERT INTO app_meta(key,value,updated_at)');await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,b,'TRANSFER'),/INJECTED_FAILURE/);
  assert.equal(await readTransferItemQuantity(f.env,7),1);assert.equal((await readMercenaryLevelState(f.env,7,'V-049')).revision,4);assert.equal((await readMercenaryLevelState(f.env,7,'V-055')).revision,0);assert.equal((await f.p('SELECT * FROM inventory_logs').all()).results.length,0);f.fail('');
  const request=body=>new Request('https://local/api/mercenaries/v3/leveling/transfer',{method:'POST',headers:{authorization:'Bearer local-account-7','content-type':'application/json',origin:'https://local'},body:JSON.stringify(body)});
  const results=await Promise.all([b,{...b,requestId:crypto.randomUUID()}].map(body=>handleMercenaryLevel({path:'mercenaries/v3/leveling/transfer',request:request(body),env:f.env,deps:f.deps})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(await readTransferItemQuantity(f.env,7),0);assert.equal((await readExperienceTransfer(f.env,7)).state.potions.length,0);assert.equal((await f.p('SELECT * FROM inventory_logs').all()).results.length,1);
 });
}
