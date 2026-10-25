import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureMercenaryLevelSchema,readMercenaryLevelState} from '../functions/_mercenary_level_policy.js';
import {MERCENARY_LEVEL_KEY,mercenaryLevelDraft,mercenaryGrowthDraft} from '../shared/mercenary-level-v1.mjs';
import {runPreparedMercenaryLevel,previewExperienceExtraction,handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {readExperienceTransfer,experienceTransferInventory,experienceTransferKey} from '../functions/_mercenary_experience_transfer.js';
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
 test(`${db}: extraction, infusion, banked breakthrough, immutable once flag and recovery`,async t=>{
  const f=await transferFixture(t,postgres),original=await rows(f),coin=await f.coin();
  await f.setState('V-049',{level:16,experience:101,breakthroughMask:7,revision:10});
  const minted=await f.extract('V-049');assert.equal(minted.result.xp,2300);assert.equal(minted.result.totalXp,4601);assert.deepEqual(minted.result.after,{level:1,experience:0,breakthroughMask:0,revision:11});
  assert.equal(Object.hasOwn(minted,'transferBeforeRaw'),false);assert.equal(Object.hasOwn(minted,'transferNext'),false);assert.equal(Object.hasOwn(minted,'policyRaw'),false);
  const inventory=await experienceTransferInventory(f.env,7);assert.equal(inventory[0].quantity,1);assert.equal(inventory[0].code,'MERCENARY_XP_TRANSFER_POTION');assert.equal((await experienceTransferInventory(f.env,8)).length,0);
  const b=await f.body('V-055',{potionId:minted.result.potion.id});const used=await runPreparedMercenaryLevel(f.env,f.user,b,'INFUSE');validateLevelReceipt(used,b.requestId);
  assert.equal(used.result.after.level,5);assert.equal(used.result.appliedXp,1500);assert.equal(used.result.bankedXp,800);
  assert.equal((await experienceTransferInventory(f.env,7)).length,0);
  assert.equal((await runPreparedMercenaryLevel(f.env,f.user,b,'INFUSE')).replayed,true);
  const br=await runPreparedMercenaryLevel(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-055',revision:1},'BREAKTHROUGH',{randomInt:()=>0});
  assert.equal(br.result.breakthroughAfter.level,6);assert.equal(br.result.after.level,8);assert.equal(br.result.after.experience,200);assert.equal(br.result.transfer.bankedAfter,0);
  const state=(await readExperienceTransfer(f.env,7)).state;assert.equal(state.mercenaries['V-055'].used,true);
  const history=await readMercenaryBreakthroughHistory(f.env,7);assert.equal(mercenaryPityFromHistory(history,'V-055',br.result.after).failures,0);
  const reset=await f.extract('V-055');assert.equal(reset.result.totalXp,2300);assert.equal(reset.result.xp,1150);
  assert.equal((await readExperienceTransfer(f.env,7)).state.mercenaries['V-055'].used,true);
  await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,await f.body('V-055',{potionId:reset.result.potion.id}),'INFUSE'),{code:'MERCENARY_TRANSFER_USED'});
  assert.deepEqual(await rows(f),original);assert.equal(await f.coin(),coin);
 });
 test(`${db}: rank/limited/ownership/quote/stale protections leave both sides unchanged`,async t=>{
  const f=await transferFixture(t,postgres);await f.setState('V-049',{level:5,experience:300,breakthroughMask:0,revision:2});const minted=await f.extract('V-049');
  const before=(await readExperienceTransfer(f.env,7)).raw;
  for(const code of ['V-001','V-996'])await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,await f.body(code,{potionId:minted.result.potion.id}),'INFUSE'),{code:'MERCENARY_TRANSFER_RANK'});
  await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,await f.body('V-049',{potionId:minted.result.potion.id}),'INFUSE'),{code:'MERCENARY_TRANSFER_SOURCE'});
  await assert.rejects(runPreparedMercenaryLevel(f.env,{id:8},await f.body('V-055',{potionId:minted.result.potion.id}),'INFUSE'),{code:'MERCENARY_LEVEL_NOT_OWNED'});
  await f.setState('V-055',{level:21,experience:0,breakthroughMask:15,revision:5});
  await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,await f.body('V-055',{potionId:minted.result.potion.id}),'INFUSE'),{code:'MERCENARY_TRANSFER_MAX'});
  await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,await f.body('V-055',{expectedXp:1,group:'SSS'}),'EXTRACT'),{code:'MERCENARY_TRANSFER_QUOTE'});
  await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,await f.body('V-055',{expectedXp:3000,group:'SSS',transferRevision:0}),'EXTRACT'),{code:'MERCENARY_LEVEL_CONFLICT'});
  assert.equal((await readExperienceTransfer(f.env,7)).raw,before);assert.equal((await readMercenaryLevelState(f.env,7,'V-055')).level,21);
  await f.setState('V-996',{level:2,experience:0,breakthroughMask:0,revision:1});const limited=await f.extract('V-996');assert.equal(limited.result.xp,750);assert.equal(limited.result.potion.group,'SSS_LIMITED');
  await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,await f.body('V-049',{potionId:limited.result.potion.id}),'INFUSE'),{code:'MERCENARY_TRANSFER_RANK'});
  assert.equal((await runPreparedMercenaryLevel(f.env,f.user,await f.body('V-999',{potionId:limited.result.potion.id}),'INFUSE')).result.appliedXp,750);
 });
 test(`${db}: rollback, same-request retry and competing receives cannot duplicate a potion`,async t=>{
  const f=await transferFixture(t,postgres);await f.setState('V-049',{level:5,experience:300,breakthroughMask:0,revision:4});
  const b=await f.body('V-049',{expectedXp:750,group:'SSS'});f.fail('INSERT INTO app_meta(key,value,updated_at)');
  await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,b,'EXTRACT'),/INJECTED_FAILURE/);assert.equal((await readMercenaryLevelState(f.env,7,'V-049')).level,5);assert.equal((await readExperienceTransfer(f.env,7)).state.potions.length,0);
  f.fail('');const minted=await runPreparedMercenaryLevel(f.env,f.user,b,'EXTRACT');assert.equal((await runPreparedMercenaryLevel(f.env,f.user,b,'EXTRACT')).replayed,true);assert.equal((await readExperienceTransfer(f.env,7)).state.potions.length,1);
  const use=await f.body('V-055',{potionId:minted.result.potion.id});f.fail('INSERT INTO app_meta(key,value,updated_at)');await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,use,'INFUSE'),/INJECTED_FAILURE/);assert.equal((await readMercenaryLevelState(f.env,7,'V-055')).revision,0);assert.equal((await readExperienceTransfer(f.env,7)).state.potions.length,1);f.fail('');
  const request=body=>new Request('https://local/api/mercenaries/v3/leveling/infuse',{method:'POST',headers:{authorization:'Bearer local-account-7','content-type':'application/json',origin:'https://local'},body:JSON.stringify(body)});
  const results=await Promise.all([use,{...use,requestId:crypto.randomUUID()}].map(body=>handleMercenaryLevel({path:'mercenaries/v3/leveling/infuse',request:request(body),env:f.env,deps:f.deps})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await readExperienceTransfer(f.env,7)).state.potions.length,0);assert.equal((await readMercenaryLevelState(f.env,7,'V-055')).revision,1);
 });
 test(`${db}: reset ends the old pity cycle; failure refills only from the received reserve`,async t=>{
  const f=await transferFixture(t,postgres);await f.setState('V-049',{level:5,experience:300,breakthroughMask:0,revision:1});
  await runPreparedMercenaryLevel(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-049',revision:1},'BREAKTHROUGH',{randomInt:()=>999999});
  const minted=await f.extract('V-049');assert.equal(minted.result.totalXp,1200);assert.equal(minted.result.xp,600);
  const memory=(await readExperienceTransfer(f.env,7)).state.mercenaries['V-049'];assert.equal(mercenaryPityFromHistory(await readMercenaryBreakthroughHistory(f.env,7),'V-049',minted.result.after,memory.resetRevision).failures,0);
  await f.setState('V-055',{level:5,experience:300,breakthroughMask:0,revision:1});const used=await runPreparedMercenaryLevel(f.env,f.user,await f.body('V-055',{potionId:minted.result.potion.id}),'INFUSE');assert.equal(used.result.appliedXp,0);assert.equal(used.result.bankedXp,600);
  const failure=await runPreparedMercenaryLevel(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-055',revision:2},'BREAKTHROUGH',{randomInt:()=>999999});assert.equal(failure.result.breakthroughAfter.experience,0);assert.equal(failure.result.after.experience,300);assert.equal(failure.result.transfer.bankedAfter,300);
  assert.equal(mercenaryPityFromHistory(await readMercenaryBreakthroughHistory(f.env,7),'V-055',failure.result.after).failures,1);
 });
}
test('client keeps uncertain requests for recovery, scopes by account, validates extraction receipts',async()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};let count=0,last;
 const client=createLevelClient({accountId:7,storage,token:'a',currentToken:()=>'a',locks:null,request:async(path,options)=>{if(path.includes('/receipt?'))return {...last,status:'COMPLETED'};count++;last={requestId:options.body.requestId,action:'EXTRACT',mercenaryCode:'V-049',result:{before:{level:2,experience:0,breakthroughMask:0,revision:1},after:{level:1,experience:0,breakthroughMask:0,revision:2}}};throw Error('lost acknowledgement');}});
 await assert.rejects(client.run('extract',{mercenaryCode:'V-049',revision:1}),/lost acknowledgement/);assert(client.pending());const r=await client.run(null,null);assert.equal(count,1);assert.equal(r.action,'EXTRACT');client.acknowledge(r.requestId);assert.equal(client.pending(),null);
 assert.equal(createLevelClient({accountId:8,storage,token:'b',currentToken:()=>'b'}).pending(),null);
});
test('new routes require same-origin authentication, reject unknown fields and honor the growth OFF switch',async t=>{
 const f=await transferFixture(t),request=(action,{auth=true,origin=true,body={}}={})=>new Request('https://local/api/mercenaries/v3/leveling/'+action,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer local-account-7'}:{}),...(origin?{origin:'https://local'}:{})},body:JSON.stringify(body)});
 const call=(action,options)=>handleMercenaryLevel({path:'mercenaries/v3/leveling/'+action,request:request(action,options),env:f.env,deps:f.deps});
 for(const action of ['extract-preview','extract','infuse'])assert.equal((await call(action,{auth:false})).status,401);
 assert.equal((await call('extract',{origin:false})).status,403);assert.equal((await call('infuse',{body:{xp:1e12}})).status,400);
 f.policy.mode='OFF';await f.setting(MERCENARY_LEVEL_KEY,f.policy);const response=await call('extract-preview',{body:await f.body('V-049')});assert.equal(response.status,423);assert.equal((await readExperienceTransfer(f.env,7)).raw,null);
});
